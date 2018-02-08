const util = require('../../utils/util');
const ajax = require('../../utils/ajax');
const messageBox = require('../../utils/messageBox');
const config = require('../../config');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    motoId: 0,
    fuelList: [],
    statisticsData: { // 统计数据
      totalMileage: 0, // 总里程
      totalAmount: 0, // 总消费
      avgFuel: 0 // 平均油耗
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.setData({ motoId: options.motoId });
    this._loadFuelList();
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
  fixed2(num) {
    return num.toFixed(2);
  },
  _loadFuelList() {
    ajax.get(`${config.apiHost}/motos/${this.data.motoId}/fuel`)
      .then(({ data }) => {
        data.fuelList.forEach(x => {
          x.refuelDate = util.formatTime(new Date(x.refuelDate), 'date');
          x.refuelAmount = util.fixed2ForNum(x.refuelAmount);
          x.uitlPrice = util.fixed2ForNum(x.uitlPrice);
          x.fuelCount = util.fixed2ForNum(x.fuelCount);
        });
        this.setData({ fuelList: data.fuelList, statisticsData: data.statisticsData });
      });
  }
})