import React from 'react';
import logoImg from '../../assets/images/logo_hookrelay.png';
import emblemImg from '../../assets/images/emblem_hookrelay.png';

export const Logo = ({
  size = 'md',
  className = '',
  showText = true,
  alt = 'HookRelay',
  ...props
}) => {
  const sizeMap = {
    xs: 'h-8',
    sm: 'h-12',
    md: 'h-16',
    lg: 'h-20',
    xl: 'h-24',
    '2xl': 'h-32',
  };

  const hasCustomHeight = className.split(' ').some(c => c.startsWith('h-') || c.includes(':h-'));
  const heightClass = hasCustomHeight ? '' : (sizeMap[size] || sizeMap.md);

  if (!showText) {
    // Pure standalone emblem icon: cleanly cropped, zero text bleed
    return (
      <img
        src={emblemImg}
        alt={alt}
        className={`aspect-square object-contain select-none shrink-0 ${heightClass} ${className}`}
        {...props}
      />
    );
  }

  return (
    <img
      src={logoImg}
      alt={alt}
      className={`w-auto object-contain select-none shrink-0 ${heightClass} ${className}`}
      {...props}
    />
  );
};

export default Logo;
