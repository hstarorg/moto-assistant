import ajax = require('../../utils/ajax');
import util = require('../../utils/util');
import type {
  FuelListResponse,
  FuelModel,
  FuelRecordView,
  StatisticsData
} from '../../types';

type FuelModelPath = `fuelModel.${keyof FuelModel}`;
type FuelFormErrors = Record<keyof FuelModel, string>;

const createEmptyFuelErrors = (): FuelFormErrors => ({
  refuelDate: '',
  currentMileage: '',
  refuelAmount: '',
  unitPrice: ''
});

const isNumberInRange = (
  value: string,
  minimum: number,
  maximum: number
): boolean => {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= minimum && number <= maximum;
};

Page({
  data: {
    motoId: 0 as number | string,
    dateNowStr: util.formatTime(new Date(), 'date'),
    fuelList: [] as FuelRecordView[],
    isLoaded: false,
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
    } as FuelModel,
    fuelErrors: createEmptyFuelErrors(),
    isSubmitting: false,
    keyboardHeight: 0
  },

  onLoad(options) {
    this.setData({ motoId: options.motoId || 0 });
    this._loadFuelList();
  },

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
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isLoaded: true });
      });
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

  handleKeyboardHeightChange(event: WechatMiniprogram.CustomEvent) {
    const detail = event.detail as { height?: number };
    const keyboardHeight = Math.max(0, detail.height || 0);
    if (keyboardHeight !== this.data.keyboardHeight) {
      this.setData({ keyboardHeight });
    }
  },

  _setInputData(key: FuelModelPath, value: string) {
    const field = key.slice('fuelModel.'.length) as keyof FuelModel;
    this.setData({
      [key]: value,
      [`fuelErrors.${field}`]: ''
    } as WechatMiniprogram.IAnyObject);
  },

  handleAddFuelClick() {
    this.setData({
      fuelModel: {
        refuelDate: util.formatTime(new Date(), 'date'),
        currentMileage: '',
        refuelAmount: '',
        unitPrice: ''
      },
      fuelErrors: createEmptyFuelErrors(),
      addModalVisible: true,
      keyboardHeight: 0
    });
  },

  cancelFuelAdd() {
    if (this.data.isSubmitting) {
      return;
    }
    this.setData({ addModalVisible: false, keyboardHeight: 0 });
  },

  handleAddFuelRecord() {
    if (this.data.isSubmitting) {
      return;
    }

    const fuelModel = this.data.fuelModel;
    const fuelErrors = createEmptyFuelErrors();
    if (!fuelModel.refuelDate) {
      fuelErrors.refuelDate = '请选择加油日期';
    }
    if (!isNumberInRange(fuelModel.currentMileage, 0, 99_999_999_999.9)) {
      fuelErrors.currentMileage = '请输入有效里程，且不能小于 0';
    }
    if (!isNumberInRange(fuelModel.unitPrice, 0.01, 999_999.9999)) {
      fuelErrors.unitPrice = '请输入大于 0 的有效油价';
    }
    if (!isNumberInRange(fuelModel.refuelAmount, 0.01, 9_999_999_999.99)) {
      fuelErrors.refuelAmount = '请输入大于 0 的有效金额';
    }

    this.setData({ fuelErrors });
    if (Object.values(fuelErrors).some(Boolean)) {
      return;
    }

    this.setData({ isSubmitting: true });
    void ajax
      .post(
        `/motos/${this.data.motoId}/fuel`,
        fuelModel as unknown as WechatMiniprogram.IAnyObject
      )
      .then(() => {
        this.setData({ addModalVisible: false, keyboardHeight: 0 });
        this._loadFuelList();
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  }
});
