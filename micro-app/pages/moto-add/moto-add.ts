import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import util = require('../../utils/util');
import type { MotoInfo } from '../../types';

type MotoInfoPath = `motoInfo.${keyof MotoInfo}`;

Page({
  data: {
    motoInfo: {
      motoPhotoUrl: '',
      motoName: '',
      motoBuyDate: '',
      motoLicensePlate: ''
    } as MotoInfo,
    dateNowStr: util.formatTime(new Date(), 'date')
  },

  onLoad() {},

  onReady() {},

  onShow() {},

  onHide() {},

  onUnload() {},

  onPullDownRefresh() {},

  onReachBottom() {},

  onShareAppMessage() {},

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
    ajax
      .uploadFile(
        '/motos',
        motoInfo.motoPhotoUrl,
        motoInfo as unknown as WechatMiniprogram.IAnyObject
      )
      .then(() => {
        messageBox.toast('添加车辆成功');
        setTimeout(() => {
          wx.reLaunch({
            url: '../index/index'
          });
        }, 1500);
      })
      .catch(() => undefined);
  },

  updateMotoName(event: WechatMiniprogram.Input) {
    this.setInputData('motoInfo.motoName', event.detail.value);
  },

  updateMotoLicensePlate(event: WechatMiniprogram.Input) {
    this.setInputData('motoInfo.motoLicensePlate', event.detail.value);
  },

  bindDateChange(event: WechatMiniprogram.PickerChange) {
    this.setInputData('motoInfo.motoBuyDate', event.detail.value as string);
  },

  setInputData(key: MotoInfoPath, value: string) {
    this.setData({ [key]: value } as WechatMiniprogram.IAnyObject);
  },

  handleUpdatePhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setInputData('motoInfo.motoPhotoUrl', res.tempFilePaths[0]);
      }
    });
  }
});
