module.exports = {
  success(message) {
    wx.showToast({
      title: message
    });
  },
  toast(message) {
    wx.showToast({
      icon: 'none',
      title: message
    });
  }
};