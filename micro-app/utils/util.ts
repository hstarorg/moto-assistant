type TimeFormat = 'date' | 'time' | 'datetime';

const formatNumber = (value: number): string => {
  const text = value.toString();
  return text[1] ? text : `0${text}`;
};

const formatTime = (date: Date, format: TimeFormat = 'datetime'): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const dateStr = [year, month, day].map(formatNumber).join('-');
  const timeStr = [hour, minute, second].map(formatNumber).join(':');
  switch (format) {
    case 'date':
      return dateStr;
    case 'time':
      return timeStr;
    default:
      return `${dateStr} ${timeStr}`;
  }
};

const fixed2ForNum = (value: number): string => {
  return value.toFixed(2);
};

export = {
  formatTime,
  fixed2ForNum
};
