import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import util = require('../../utils/util');
import type { Moto, MotoInfo } from '../../types';

type MotoInfoPath = `motoInfo.${keyof MotoInfo}`;
type MotoFormErrors = Record<keyof MotoInfo, string>;

const createEmptyMotoInfo = (): MotoInfo => ({
  motoPhotoUrl: '',
  motoName: '',
  motoBuyDate: '',
  motoLicensePlate: ''
});

const createEmptyFormErrors = (): MotoFormErrors => ({
  motoPhotoUrl: '',
  motoName: '',
  motoBuyDate: '',
  motoLicensePlate: ''
});

Page({
  data: {
    motoId: 0,
    motoInfo: createEmptyMotoInfo(),
    selectedPhotoPath: '',
    dateNowStr: util.formatTime(new Date(), 'date'),
    formErrors: createEmptyFormErrors(),
    isArchiving: false,
    isEditing: false,
    isPageReady: true,
    isSubmitting: false,
    loadFailed: false,
    privacyContractName: '《小程序隐私保护指引》',
    showPrivacy: false
  },

  onLoad(options: Record<string, string | undefined>) {
    const motoId = Number(options.motoId);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return;
    }

    wx.setNavigationBarTitle({ title: '编辑车辆' });
    this.setData({ isEditing: true, isPageReady: false, motoId });
    this.loadMoto();
  },

  loadMoto() {
    if (!this.data.isEditing) {
      return;
    }

    this.setData({ isPageReady: false, loadFailed: false });
    void ajax
      .get<Moto>(`/motos/${this.data.motoId}`, {
        showError: false,
        showLoading: false
      })
      .then(({ data }) => {
        this.setData({
          isPageReady: true,
          motoInfo: {
            motoBuyDate: data.motoBuyDate,
            motoLicensePlate: data.motoLicensePlate,
            motoName: data.motoName,
            motoPhotoUrl: data.motoPhotoUrl
          }
        });
      })
      .catch(() => {
        this.setData({ loadFailed: true });
      });
  },

  handleFormSubmit() {
    if (this.data.isSubmitting || this.data.isArchiving) {
      return;
    }

    const motoInfo = {
      ...this.data.motoInfo,
      motoLicensePlate: this.data.motoInfo.motoLicensePlate.trim(),
      motoName: this.data.motoInfo.motoName.trim()
    };
    const formErrors = createEmptyFormErrors();
    if (!motoInfo.motoPhotoUrl) {
      formErrors.motoPhotoUrl = '请选择车辆图片';
    }
    if (!motoInfo.motoName) {
      formErrors.motoName = '请输入车辆名称';
    }
    if (!motoInfo.motoBuyDate) {
      formErrors.motoBuyDate = '请选择购买日期';
    }
    if (!motoInfo.motoLicensePlate) {
      formErrors.motoLicensePlate = '请输入车牌号';
    }

    this.setData({ formErrors, motoInfo });
    if (Object.values(formErrors).some(Boolean)) {
      return;
    }

    const submitRequest = this.createSubmitRequest(motoInfo);
    this.setData({ isSubmitting: true });
    void submitRequest
      .then(() => {
        messageBox.toast(this.data.isEditing ? '车辆信息已更新' : '添加车辆成功');
        setTimeout(() => {
          if (this.data.isEditing) {
            this.navigateBackToIndex();
            return;
          }
          wx.reLaunch({ url: '../index/index' });
        }, 1200);
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  },

  createSubmitRequest(motoInfo: MotoInfo) {
    const formData = motoInfo as unknown as WechatMiniprogram.IAnyObject;
    if (!this.data.isEditing) {
      return ajax.uploadFile('/motos', this.data.selectedPhotoPath, formData);
    }
    if (this.data.selectedPhotoPath) {
      return ajax.uploadFile(
        `/motos/${this.data.motoId}`,
        this.data.selectedPhotoPath,
        formData
      );
    }
    return ajax.put(`/motos/${this.data.motoId}`, formData);
  },

  handleArchive() {
    if (this.data.isSubmitting || this.data.isArchiving) {
      return;
    }

    wx.showModal({
      title: '归档这辆车？',
      content: '归档后不会显示在“使用中”，历史加油记录仍会保留。',
      confirmText: '确认归档',
      confirmColor: '#a51d1a',
      success: ({ confirm }) => {
        if (confirm) {
          this.archiveMoto();
        }
      }
    });
  },

  archiveMoto() {
    this.setData({ isArchiving: true });
    void ajax
      .post(`/motos/${this.data.motoId}/archive`, {})
      .then(() => {
        messageBox.toast('车辆已归档');
        setTimeout(() => this.navigateBackToIndex(), 1200);
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isArchiving: false });
      });
  },

  navigateBackToIndex() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '../index/index' })
    });
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
    const field = key.slice('motoInfo.'.length) as keyof MotoInfo;
    this.setData({
      [key]: value,
      [`formErrors.${field}`]: ''
    } as WechatMiniprogram.IAnyObject);
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
        this.setData({ selectedPhotoPath: file.tempFilePath });
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
