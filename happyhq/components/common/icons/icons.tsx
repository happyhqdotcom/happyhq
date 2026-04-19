import React from 'react'

export interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  children?: React.ReactNode
}

export const Icon: React.FC<IconProps> = ({
  size = 24,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`inline-flex ${className}`}
      style={{ width: size, height: size }}
      {...props}
    >
      {children}
    </div>
  )
}
