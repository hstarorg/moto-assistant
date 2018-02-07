// pages/moto-add/moto-add.js
const util = require('../../utils/util');
const ajax = require('../../utils/ajax');
const messageBox = require('../../utils/messageBox');
const config = require('../../config');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    motoInfo: {
      motoPhotoUrl: '',
      motoName: '',
      motoBuyDate: '',
      motoLicensePlate: ''
    },
    dateNowStr: util.formatTime(new Date(), 'date')
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
  },

  handleFormSubmit() {
    const motoInfo = this.data.motoInfo;
    if (!motoInfo.motoPhotoUrl) {
      return messageBox.toast('请上传车辆图片');
    } else if (!motoInfo.motoName) {
      return messageBox.toast('请输入车辆名称');
    } else if (!motoInfo.motoBuyDate) {
      return messageBox.toast('请选择购买日期');
    } else if (!motoInfo.motoLicensePlate) {
      return messageBox.toast('请输入车牌号');
    }
    ajax.uploadFile(`${config.apiHost}/moto`, motoInfo.motoPhotoUrl, motoInfo)
      .then(() => {
        messageBox.toast('添加车辆成功');
        setTimeout(() => {
          wx.navigateTo({
            url: '../index/index'
          })
        }, 1500);
      });
  },
  updateMotoName(e) {
    const value = e.detail.value;
    this.setInputData('motoInfo.motoName', value);
  },
  updateMotoLicensePlate(e) {
    const value = e.detail.value;
    this.setInputData('motoInfo.motoLicensePlate', value);
  },
  bindDateChange(e) {
    const value = e.detail.value;
    this.setInputData('motoInfo.motoBuyDate', value);
  },
  setInputData(key, value) {
    this.setData({ [key]: value });
  },
  handleUpdatePhoto() {
    const self = this;
    wx.chooseImage({
      count: 1, // 默认9
      sizeType: ['original', 'compressed'], // 可以指定是原图还是压缩图，默认二者都有
      sourceType: ['album', 'camera'], // 可以指定来源是相册还是相机，默认二者都有
      success: function (res) {
        // 返回选定照片的本地文件路径列表，tempFilePath可以作为img标签的src属性显示图片
        self.setInputData('motoInfo.motoPhotoUrl', res.tempFilePaths[0]);
      }
    })
  }
})
