// 复用 desktop 的设计 token(颜色 / 字号 / 动效档位),保证移动端与桌面端品牌一致。
// 仅布局范式不同(底部 Tab / 单列 / 触摸),设计语言统一。
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // A11 Motion Token(M3 对齐)
      transitionDuration: {
        instant: '50ms',   // 微反馈(按钮按下高亮)
        fast: '100ms',     // 状态切换(switch / tab)
        normal: '200ms',   // 常规过渡(抽屉打开)
        slow: '400ms',     // 强调动效
        cinematic: '600ms',// 叙事动效
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.2, 0, 0, 1.4)',
        decelerate: 'cubic-bezier(0, 0, 0, 1)',
        accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
      },
      // 8 色受限调色板(与 desktop 一致)
      colors: {
        ink: '#0E1117',        // 墨靛(暗色背景主色)
        paper: '#F8FAFC',      // 纸白(亮色背景)
        gold: '#E8C56C',       // 暖金(强调)
        seal: '#C75D4F',       // 印章红(警示)
        olive: '#7B8B3D',      // 橄榄(完成态)
        teal: '#3D7B8B',       // 蓝绿(信息态)
        primary: '#3B82F6',
        surface: '#F8FAFC',
        danger: '#EF4444',
      },
      fontSize: {
        'xs-2': ['12px', '16px'],
        'sm-2': ['14px', '20px'],
        'base-2': ['16px', '24px'],
        'lg-2': ['20px', '28px'],
        'xl-2': ['24px', '32px'],
        '2xl-2': ['32px', '40px'],
        '3xl-2': ['40px', '48px'],
        '4xl-2': ['56px', '64px'],
        '5xl-2': ['72px', '80px'],
      },
    },
  },
  plugins: [],
};
