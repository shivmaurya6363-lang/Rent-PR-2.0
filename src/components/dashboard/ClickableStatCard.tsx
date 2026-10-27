"use client";

import { useNavigate } from '@/lib/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClickableStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  href: string;
  valueClassName?: string;
}

const ClickableStatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  valueClassName,
}: ClickableStatCardProps) => {
  const navigate = useNavigate();
  
  const handleClick = () => {
    // Use soft routing for better UX
    navigate(href);
  };

  return (
    <Card
      onClick={handleClick}
      className={cn(
        "cursor-pointer transition-all duration-200",
        "hover:shadow-lg hover:scale-[1.02] hover:border-primary/50",
        "active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Navigate to ${title}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", valueClassName)}>{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ClickableStatCard;
