const messageBox = {
  success(message: string) {
    wx.showToast({
      title: message
    });
  },

  toast(message: string) {
    wx.showToast({
      icon: 'none',
      title: message
    });
  }
};

export = messageBox;
