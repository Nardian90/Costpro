import React from 'react';

export const TrendChart = () => {
  return (
    <div className="h-10 w-32 flex items-end gap-1 px-2">
       {[40, 60, 45, 70, 55, 80, 75, 90].map((h, i) => (
          <div
             key={i}
             className="flex-1 bg-primary/20 rounded-t-sm group-hover:bg-primary/40 transition-all"
             style={{ height: `${h}%` }}
          />
       ))}
    </div>
  );
};
