"use client";

const stats = [
  { value: "5+", label: "Cities" },
  { value: "3+", label: "Years in Business" },
  { value: "50+", label: "Products" },
  { value: "1,000+", label: "Happy Customers" },
];

const StatsSection = () => {
  return (
    <section className="py-14 bg-primary">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mx-auto text-center">
          {stats.map((stat, i) => (
            <div key={stat.label} className="relative">
              <p className="text-3xl md:text-4xl font-extrabold text-white">{stat.value}</p>
              <p className="text-xs font-medium text-white/70 tracking-wider mt-1 uppercase">
                {stat.label}
              </p>
              {i < stats.length - 1 && (
                <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-10 bg-white/20" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
