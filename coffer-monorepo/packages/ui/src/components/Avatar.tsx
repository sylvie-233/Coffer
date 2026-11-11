'use client';

import { avatarInitials, cn } from '@coffer/utils';

export interface AvatarProps {
  url: string | null;
  name: string;
  /** 6 位 HEX（不带 #），与数据库存储一致。 */
  color: string;
  className?: string;
  title?: string;
  onClick?: () => void;
}

/** 头像：优先展示已解密的本地对象 URL，否则用昵称首字与底色。 */
export function Avatar({ url, name, color, className, title, onClick }: AvatarProps) {
  const hex = color.replace(/^#/, '') || '125B4A';
  return (
    <div
      className={cn('avatar', className)}
      style={{ background: `#${hex}`, color: '#fff' }}
      title={title}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {url ? <img src={url} alt={name} /> : avatarInitials(name)}
    </div>
  );
}
