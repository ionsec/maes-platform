import darkTheme from './darkTheme';
import lightTheme from './lightTheme';
import cyberpunkTheme from './cyberpunkTheme';
import blueTheme from './blueTheme';
import greenTheme from './greenTheme';

export const themes = {
  dark: {
    id: 'dark',
    name: 'DFIR Dark',
    description: 'Professional dark theme optimized for digital forensics and incident response',
    theme: darkTheme,
    icon: '🌙',
    category: 'Professional'
  },
  light: {
    id: 'light',
    name: 'Professional Light',
    description: 'Clean light theme for daytime use and presentations',
    theme: lightTheme,
    icon: '☀️',
    category: 'Professional'
  },
  blue: {
    id: 'blue',
    name: 'Security Blue',
    description: 'Blue-focused theme for security operations centers',
    theme: blueTheme,
    icon: '🔵',
    category: 'Security'
  },
  green: {
    id: 'green',
    name: 'Matrix Terminal',
    description: 'Green matrix-style theme for the ultimate hacker experience',
    theme: greenTheme,
    icon: '💚',
    category: 'Terminal'
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'Futuristic cyberpunk theme with neon colors and sharp edges',
    theme: cyberpunkTheme,
    icon: '🌈',
    category: 'Experimental'
  }
};

export const themeCategories = {
  Professional: {
    name: 'Professional',
    description: 'Clean, professional themes for business environments',
    icon: '💼'
  },
  Security: {
    name: 'Security',
    description: 'Themes optimized for security operations and monitoring',
    icon: '🛡️'
  },
  Terminal: {
    name: 'Terminal',
    description: 'Terminal and command-line inspired themes',
    icon: '💻'
  },
  Experimental: {
    name: 'Experimental',
    description: 'Creative and experimental themes for fun',
    icon: '🎨'
  }
};

export const getThemeById = (themeId) => {
  return themes[themeId] || themes.dark;
};

export const getThemesByCategory = () => {
  const categorized = {};
  
  Object.values(themes).forEach(theme => {
    const category = theme.category;
    if (!categorized[category]) {
      categorized[category] = [];
    }
    categorized[category].push(theme);
  });
  
  return categorized;
};

export default themes;