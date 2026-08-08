import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import util = require('../../utils/util');
import type {
  FuelListResponse,
  FuelModel,
  FuelRecordView,
  StatisticsData
} from '../../types';

type FuelModelPath = `fuelModel.${keyof FuelModel}`;

Page({
  data: {
    motoId: 0 as number | string,
    fuelList: [] as FuelRecordView[],
    addModalVisible: false,
    statisticsData: {
      totalMileage: 0,
      totalAmount: 0,
      avgFuel: 0,
      avgPrice: 0
    } as StatisticsData,
    fuelModel: {
      refuelDate: '',
      currentMileage: '',
      refuelAmount: '',
      unitPrice: ''
    } as FuelModel
  },

  onLoad(options) {
    this.setData({ motoId: options.motoId || 0 });
    this._loadFuelList();
  },

  onReady() {},

  onShow() {},

  onHide() {},

  onUnload() {},

  onPullDownRefresh() {},

  onReachBottom() {},

  onShareAppMessage() {},

  handlePopupFormSubmit() {},

  _loadFuelList() {
    ajax
      .get<FuelListResponse>(`/motos/${this.data.motoId}/fuel`)
      .then(({ data }) => {
        const fuelList = data.fuelList.map(record => ({
          id: record.id,
          currentMileage: record.currentMileage,
          refuelDate: util.formatTime(new Date(record.refuelDate), 'date'),
          refuelAmount: util.fixed2ForNum(record.refuelAmount),
          unitPrice: util.fixed2ForNum(record.unitPrice),
          fuelCount: util.fixed2ForNum(record.fuelCount)
        }));
        this.setData({
          fuelList,
          statisticsData: data.statisticsData
        });
      })
      .catch(() => undefined);
  },

  updateCurrentMileage(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.currentMileage', event.detail.value);
  },

  updateUnitPrice(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.unitPrice', event.detail.value);
  },

  updateRefuelAmount(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.refuelAmount', event.detail.value);
  },

  bindDateChange(event: WechatMiniprogram.PickerChange) {
    this._setInputData('fuelModel.refuelDate', event.detail.value as string);
  },

  _setInputData(key: FuelModelPath, value: string) {
    this.setData({ [key]: value } as WechatMiniprogram.IAnyObject);
  },

  handleAddFuelClick() {
    this.setData({
      fuelModel: {
        refuelDate: util.formatTime(new Date(), 'date'),
        currentMileage: '',
        refuelAmount: '',
        unitPrice: ''
      },
      addModalVisible: true
    });
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
    } else if (!fuelModel.unitPrice) {
      return messageBox.toast('请输入当日油价');
    } else if (!fuelModel.refuelAmount) {
      return messageBox.toast('请输入加油总额');
    }
    ajax
      .post(
        `/motos/${this.data.motoId}/fuel`,
        fuelModel as unknown as WechatMiniprogram.IAnyObject
      )
      .then(() => {
        this.cancelFuelAdd();
        this._loadFuelList();
      })
      .catch(() => undefined);
  }
});
