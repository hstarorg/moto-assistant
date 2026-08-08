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
    dateNowStr: util.formatTime(new Date(), 'date'),
    privacyContractName: '《小程序隐私保护指引》',
    showPrivacy: false
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
    if (typeof wx.getPrivacySetting !== 'function') {
      this.choosePhoto();
      return;
    }

    wx.getPrivacySetting({
      success: ({ needAuthorization, privacyContractName }) => {
        if (!needAuthorization) {
          this.choosePhoto();
          return;
        }
        this.setData({
          privacyContractName:
            privacyContractName || '《小程序隐私保护指引》',
          showPrivacy: true
        });
      },
      fail: () => {
        messageBox.toast('暂时无法获取隐私授权状态');
      }
    });
  },

  handleAgreePrivacyAuthorization() {
    this.setData({ showPrivacy: false });
    this.choosePhoto();
  },

  handleRejectPrivacyAuthorization() {
    this.setData({ showPrivacy: false });
    messageBox.toast('未同意隐私指引，无法选择车辆图片');
  },

  openPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      messageBox.toast('当前微信版本不支持查看隐私指引');
      return;
    }
    wx.openPrivacyContract({
      fail: () => {
        messageBox.toast('隐私指引打开失败');
      }
    });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles[0];
        if (!file) {
          return;
        }
        if (file.size > 10_000_000) {
          messageBox.toast('图片不能超过 10 MB');
          return;
        }
        this.setInputData('motoInfo.motoPhotoUrl', file.tempFilePath);
      },
      fail: ({ errMsg }) => {
        if (!errMsg.includes('cancel')) {
          messageBox.toast('图片选择失败，请重试');
        }
      }
    });
  }
});
