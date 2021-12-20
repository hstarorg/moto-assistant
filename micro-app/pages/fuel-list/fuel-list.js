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
    addModalVisible: false,
    statisticsData: { // 统计数据
      totalMileage: 0, // 总里程
      totalAmount: 0, // 总消费
      avgFuel: 0 // 平均油耗
    },
    fuelModel: {
      refuelDate: '',
      currentMileage: '',
      refuelAmount: '',
      uitlPrice: ''
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
  handlePopupFormSubmit() {

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
  },
  updateCurrentMileage(e) {
    const value = e.detail.value;
    this._setInputData('fuelModel.currentMileage', value);
  },
  updateUitlPrice(e) {
    const value = e.detail.value;
    this._setInputData('fuelModel.uitlPrice', value);
  },
  updateRefuelAmount(e) {
    const value = e.detail.value;
    this._setInputData('fuelModel.refuelAmount', value);
  },
  bindDateChange(e) {
    const value = e.detail.value;
    this._setInputData('fuelModel.refuelDate', value);
  },
  _setInputData(key, value) {
    this.setData({ [key]: value });
  },
  handleAddFuelClick() {
    // init the model
    this.setData({
      fuelModel: {
        refuelDate: util.formatTime(new Date(), 'date'),
        currentMileage: '',
        refuelAmount: '',
        uitlPrice: ''
      },
      addModalVisible: true,
    });
    console.log('test')
  },
  cancelFuelAdd() {
    this.setData({ addModalVisible: false });
  },
  handelAddFuelRecord() {
    const fuelModel = this.data.fuelModel;
    if (!fuelModel.refuelDate) {
      return messageBox.toast('请选择加油日期');
    } else if (!fuelModel.currentMileage) {
      return messageBox.toast('请输入当前里程');
    } else if (!fuelModel.uitlPrice) {
      return messageBox.toast('请输入当日油价');
    } else if (!fuelModel.refuelAmount) {
      return messageBox.toast('请输入加油总额');
    }
    ajax.post(`${config.apiHost}/motos/${this.data.motoId}/fuel`, fuelModel)
      .then(({ data }) => {
        this.cancelFuelAdd();
        this._loadFuelList();
      }).catch(err => {
        console.log('err', err);
      });
  }
})
