/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // A11 Motion Token(M3 对齐,见 §7.2)
      // 删除 800ms 档位,只保留 5 档
      transitionDuration: {
        instant: '50ms',   // 微反馈(按钮按下高亮)
        fast: '100ms',     // 状态切换(switch / tab)
        normal: '200ms',   // 常规过渡(sidebar / 模态打开)
        slow: '400ms',     // 强调动效(落砖动画)
        cinematic: '600ms',// 叙事动效(生灵孵化 / 胶囊封存)
      },
      transitionTimingFunction: {
        // M3 Standard Easing
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.2, 0, 0, 1.4)',
        decelerate: 'cubic-bezier(0, 0, 0, 1)',
        accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
      },
      // 8 色受限调色板(见 §7.3,v3.1 重排)
      colors: {
        // 中性骨架
        ink: '#0E1117',        // 墨靛(暗色背景主色)
        paper: '#F8FAFC',      // 纸白(亮色背景)
        // 强调三色
        gold: '#E8C56C',       // 暖金(强调 / 落砖)
        seal: '#C75D4F',       // 印章红(警示 / 亮色小文字,4.6:1 AA)
        olive: '#7B8B3D',      // 橄榄(完成态,v3.1 替换 #D08C5E)
        teal: '#3D7B8B',       // 蓝绿(信息态,v3.1 替换 #A8956E)
        // 兼容旧 token(避免破坏现有组件)
        primary: '#3B82F6',
        surface: '#F8FAFC',
        danger: '#EF4444',
      },
      // 字号阶梯(见 §7.4)
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
