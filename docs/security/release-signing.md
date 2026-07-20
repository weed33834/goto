# Release 签名验证

TaskFlow 桌面端 Release 由 `.github/workflows/release.yml` 自动构建，并使用 [cosign](https://github.com/sigstore/cosign) 对发布产物进行 keyless 签名。

每个 Release 页面会提供：

- 各平台安装包（`.AppImage`、`.dmg`、`.exe`）
- 对应的 `.sig` 签名文件
- 对应的 `.crt` 证书文件
- `SHA256SUMS.txt` 校验文件

## 验证签名

下载需要验证的文件及其 `.sig`、`.crt` 后，运行：

```bash
cosign verify-blob \
  --signature TaskFlow-0.2.0.AppImage.sig \
  --certificate TaskFlow-0.2.0.AppImage.crt \
  --cert-identity "https://github.com/MS33834/taskflow/.github/workflows/release.yml@refs/tags/v0.2.0" \
  --cert-oidc-issuer "https://token.actions.githubusercontent.com" \
  TaskFlow-0.2.0.AppImage
```

其中：

- `--cert-identity` 必须与发布时使用的 workflow 路径和标签完全一致。按实际仓库名、workflow 路径和标签替换。
- `--cert-oidc-issuer` 固定为 GitHub Actions 的 OIDC issuer。

### 使用通配身份验证

如果你不想指定具体标签，可以使用基于身份的通配符（需 cosign 支持 `--cert-identity-regexp`）：

```bash
cosign verify-blob \
  --signature TaskFlow-0.2.0.AppImage.sig \
  --certificate TaskFlow-0.2.0.AppImage.crt \
  --cert-identity-regexp '^https://github.com/MS33834/taskflow/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --cert-oidc-issuer "https://token.actions.githubusercontent.com" \
  TaskFlow-0.2.0.AppImage
```

## 校验文件完整性

每个 Release 都包含 `SHA256SUMS.txt`，可使用 sha256sum 校验：

```bash
sha256sum -c SHA256SUMS.txt
```

## 故障排查

- 验证失败通常是因为 `--cert-identity` 与签名时的 workflow ref 不匹配，请检查标签名和仓库名。
- 如果 `.crt` 文件缺失，说明签名步骤未正常完成，请勿安装该产物。
