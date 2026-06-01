"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Send, Users, MailOpen, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  color: string;
}

const STATS: StatCard[] = [
  {
    title: "Emails Sent",
    value: "124,532",
    change: 12.5,
    icon: Send,
    color: "text-blue-500",
  },
  {
    title: "Subscribers",
    value: "48,291",
    change: 8.2,
    icon: Users,
    color: "text-violet-500",
  },
  {
    title: "Open Rate",
    value: "34.6%",
    change: 2.1,
    icon: MailOpen,
    color: "text-emerald-500",
  },
  {
    title: "Click Rate",
    value: "8.4%",
    change: -1.3,
    icon: MousePointerClick,
    color: "text-amber-500",
  },
];

export function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat, i) => {
        const Icon = stat.icon;
        const isPositive = stat.change >= 0;

        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.07 }}
            className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <div className={cn("rounded-lg bg-muted p-2", stat.color)}>
                <Icon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  isPositive ? "text-emerald-600" : "text-red-500"
                )}
              >
                {isPositive ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {isPositive ? "+" : ""}
                {stat.change}%
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              vs. last 30 days
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
