module.exports = {
  content: ['./src/renderer-react/index.html', './src/renderer-react/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0C1015',
        sidebar: '#111820',
        panel: '#121922',
        raised: '#19212B',
        editor: '#0E131A',
        border: '#2A323D',
        'border-strong': '#384251',
        primary: '#F5F9FF',
        secondary: '#AEB8C4',
        muted: '#7D8A98',
        accent: '#FFD21F',
        success: '#62F28F',
        danger: '#FF6B6B',
        warning: '#F5B84B'
      },
      borderRadius: {
        control: '16px',
        card: '24px',
        panel: '30px'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace']
      },
      boxShadow: {
        soft: '0 18px 60px rgba(0, 0, 0, 0.22)',
        focus: '0 0 0 1px rgba(255, 210, 31, 0.28), 0 0 0 5px rgba(255, 210, 31, 0.08)'
      }
    }
  },
  plugins: []
};
