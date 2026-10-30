import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import type { MetricsBucketDto } from '../services/api';

export function MetricsChart({ data }: { data: MetricsBucketDto[] }) {
  const formattedData = data.map(d => ({
    ...d,
    timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }));

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis dataKey="timeLabel" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={40} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 4, color: '#fff' }}
            itemStyle={{ color: '#ccc' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
          <Line type="monotone" dataKey="started" stroke="var(--primary)" strokeWidth={2} dot={false} name="Started" />
          <Line type="monotone" dataKey="completed" stroke="var(--success)" strokeWidth={2} dot={false} name="Completed" />
          <Line type="monotone" dataKey="failed" stroke="var(--danger)" strokeWidth={2} dot={false} name="Failed" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SuccessRateChart({ data }: { data: MetricsBucketDto[] }) {
  const formattedData = data.map(d => {
    const total = d.completed + d.failed;
    return {
      timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rate: total > 0 ? ((d.completed / total) * 100).toFixed(1) : 0
    };
  });

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis dataKey="timeLabel" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 4, color: '#fff' }}
            itemStyle={{ color: '#ccc' }}
            formatter={(value: any) => [`${value}%`, 'Success Rate']}
          />
          <Line type="monotone" dataKey="rate" stroke="#a855f7" strokeWidth={2} dot={false} name="Success Rate" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
