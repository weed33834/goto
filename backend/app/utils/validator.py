"""参数校验工具"""
import ipaddress
import os
import re
import socket
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse


class ValidationError(Exception):
    """参数校验异常"""
    pass


def _safe_join(base_dir: Path, subpath: str) -> Path:
    """将受校验的子路径安全地拼接到 base_dir 下。

    先对子路径做规范化（os.path.normpath），再通过与 base_dir 的绝对路径
    做 startswith 前缀校验，确保结果一定位于 base_dir 之内。最后用
    os.path.realpath 解析符号链接并重新校验，防止 base_dir 内的符号链接
    指向外部路径导致的符号链接攻击。该写法与 CodeQL 内置的 path-injection
    清洗模型（PathNormalization + SafeAccessCheck）对齐，可被静态分析
    识别为安全的数据流。
    """
    if not subpath or not subpath.strip():
        raise ValidationError("子路径不能为空")
    if "\x00" in subpath:
        raise ValidationError("子路径包含空字符")

    base = os.path.abspath(str(base_dir))
    base_real = os.path.realpath(base)
    normalized = os.path.normpath(subpath)

    # 禁止向上逃逸的相对路径（绝对路径不做此判断，由下方 realpath 校验处理）
    if not os.path.isabs(normalized):
        if normalized.startswith("..") or "/../" in (normalized + os.sep):
            raise ValidationError(f"子路径超出允许范围: {subpath}")
        full = os.path.join(base, normalized)
    else:
        # 绝对路径：直接以规范化后的绝对路径作为候选
        full = normalized

    # startswith 前缀校验（基于 realpath 规范化结果）：兼容 Windows 8.3 短名
    # （如 ADMINI~1）与符号链接，先展开再比较，防止 base_dir 内的符号链接
    # 或短名绕过导致目录穿越。该写法与 CodeQL 内置的 path-injection 清洗模型
    # （PathNormalization + SafeAccessCheck）对齐，可被静态分析识别为安全数据流。
    full_real = os.path.realpath(full)
    if not (full_real == base_real or full_real.startswith(base_real + os.sep)):
        raise ValidationError(f"文件路径超出允许范围: {subpath}")

    return Path(full_real)


def validate_file_path(path: str, base_dir: Optional[Path] = None) -> Path:
    """校验文件路径合法性

    如果提供 base_dir，则要求解析后的路径必须位于 base_dir 之内，
    防止目录遍历攻击。
    """
    if not path or not path.strip():
        raise ValidationError("文件路径不能为空")

    if "\x00" in path:
        raise ValidationError("文件路径包含空字符")

    # 检查命令注入分隔符（shell metacharacters）。
    # 仅拒绝在“路径上下文”下确实危险的注入分隔符 ; | & ；
    # 放行 ~ 与 $（Windows 8.3 短名如 C:\Users\ADMINI~1、环境变量路径中
    # 常见）以及反引号（合法文件名字符）。真正的目录穿越由下方 _safe_join
    # 的 normpath + startswith + realpath 三重校验处理；之前用子串匹配
    # ".." 会误杀 my..notes.txt 等合法文件名，也不再使用。
    dangerous_chars = ["|", "&", ";"]
    for char in dangerous_chars:
        if char in path:
            raise ValidationError(f"文件路径包含非法字符: {char}")

    try:
        # 使用 os.path.normpath 进行路径规范化，该函数被 CodeQL 识别为
        # PathNormalization，可与后续 startswith 前缀校验组成完整清洗链。
        normalized = os.path.normpath(path)
    except Exception as e:
        raise ValidationError(f"无效的文件路径: {e}")

    if base_dir is not None:
        return _safe_join(base_dir, normalized)

    # 无 base_dir 限制时，仍禁止向上逃逸并转为绝对路径
    if normalized.startswith("..") or "/../" in (normalized + os.sep):
        raise ValidationError(f"文件路径超出允许范围: {path}")

    return Path(os.path.abspath(normalized))


def is_internal_ip(ip: str) -> bool:
    """判断 IP 地址是否属于私有、回环、链路本地或保留范围。"""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved


def _is_internal_host(hostname: str) -> bool:
    """判断主机名是否指向内网、回环或链路本地地址。

    用于防止通过 Git 克隆接口发起 SSRF，避免后端请求内网元数据服务
    （如 169.254.169.254）或本地服务。
    """
    if not hostname:
        return True

    lower = hostname.lower()
    if lower in ("localhost", "127.0.0.1", "::1"):
        return True

    return is_internal_ip(hostname)


def validate_git_url(url: str) -> str:
    """校验 Git 仓库 URL，拒绝内网/回环/链路本地地址与非标准端口，防止 SSRF。

    TF2-012 修复（DNS 重绑定）：除原 hostname 字面量与单次解析校验外，
    额外要求该域名解析到的 **所有** A/AAAA 记录均不是内部地址，且拒绝
    解析结果中同时混有公网与内网 IP 的情况。配合 git_manager 在克隆前
    的二次校验，最大限度缩小 TOCTOU 窗口。
    """
    if not url or not url.strip():
        raise ValidationError("Git URL 不能为空")

    url = url.strip()

    # 支持 HTTPS 和 SSH 格式
    https_pattern = r"^https?://[\w\-\.]+(:\d+)?/[\w\-\.]+/[\w\-\.]+(\.git)?$"
    ssh_pattern = r"^git@[\w\-\.]+:[\w\-\.]+/[\w\-\.]+(\.git)?$"

    if not (re.match(https_pattern, url) or re.match(ssh_pattern, url)):
        raise ValidationError(f"无效的 Git URL 格式: {url}")

    is_ssh = url.startswith("git@")
    parsed = urlparse(url)

    if is_ssh:
        # SSH 格式 git@host:path 没有 scheme，urlparse 会把 host 放到 path
        hostname: Optional[str] = url.split(":", 1)[0].split("@", 1)[-1]
        port: Optional[int] = 22
    else:
        hostname = parsed.hostname
        port = parsed.port

    if not hostname:
        raise ValidationError(f"无效的 Git URL 格式: {url}")

    # 未显式指定端口时根据 scheme 推断
    if port is None:
        port = 443 if parsed.scheme == "https" else 80

    allowed_ports = {22, 80, 443, 9418}
    if port not in allowed_ports:
        raise ValidationError(f"Git URL 使用了非标准端口，不被允许: {port}")

    # 检查主机名是否直接指向内部地址
    if _is_internal_host(hostname):
        raise ValidationError(f"Git URL 指向内部或本地地址，不被允许: {url}")

    # 对域名进行解析校验：要求所有解析结果都不是内部地址（TF2-012 DNS 重绑定防御）。
    # 若 hostname 本身就是 IP 字面量，上面 _is_internal_host 已判定；这里只处理域名。
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        try:
            # getaddrinfo 返回该域名所有 A/AAAA 记录，比 gethostbyname 更完整
            addr_infos = socket.getaddrinfo(
                hostname, None, proto=socket.IPPROTO_TCP
            )
        except (socket.gaierror, UnicodeError) as exc:
            raise ValidationError(f"无法解析 Git URL 主机名: {hostname}") from exc

        resolved_ips = set()
        for addr in addr_infos:
            sockaddr = addr[4]
            if isinstance(sockaddr, tuple) and len(sockaddr) >= 1:
                ip = sockaddr[0]
                if isinstance(ip, str):
                    resolved_ips.add(ip)
        if not resolved_ips:
            raise ValidationError(f"Git URL 主机名无解析结果: {hostname}")

        # 任一解析结果指向内部地址即拒绝（防止混入内网 IP 的 DNS 重绑定）
        bad_ips = [ip for ip in resolved_ips if is_internal_ip(ip)]
        if bad_ips:
            raise ValidationError(
                f"Git URL 主机名解析到内部地址，不被允许: {url} -> {bad_ips}"
            )

    return url


def validate_model_config(provider: str, model: str) -> None:
    """校验大模型配置"""
    valid_providers = ["openai", "ollama"]
    if provider not in valid_providers:
        raise ValidationError(
            f"不支持的模型提供商: {provider}，支持: {valid_providers}"
        )

    if not model or not model.strip():
        raise ValidationError("模型名称不能为空")


def validate_category(category: Optional[str]) -> Optional[str]:
    """校验分类名称"""
    if category is None:
        return None

    category = category.strip()
    if not category:
        raise ValidationError("分类名称不能为空")

    if len(category) > 100:
        raise ValidationError("分类名称不能超过 100 个字符")

    if any(c in category for c in ("..", "/", "\\", os.sep)):
        raise ValidationError("分类名称包含非法字符")

    if category in (".", ".."):
        raise ValidationError("分类名称不能为 '.' 或 '..'")

    return category
