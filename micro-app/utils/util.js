const formatTime = (date, format) => {
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
}

const formatNumber = n => {
  n = n.toString();
  return n[1] ? n : '0' + n;
};

const fixed2ForNum = n => {
  return n.toFixed(2);
};

module.exports = {
  formatTime,
  fixed2ForNum
};
