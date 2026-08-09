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
type FuelFormErrors = Record<keyof FuelModel, string>;

const createEmptyFuelErrors = (): FuelFormErrors => ({
  refuelDate: '',
  currentMileage: '',
  refuelAmount: '',
  unitPrice: ''
});

const copyFuelModel = (fuelModel: FuelModel): FuelModel => ({ ...fuelModel });

const fuelModelsEqual = (left: FuelModel, right: FuelModel): boolean => {
  return (
    left.refuelDate === right.refuelDate &&
    left.currentMileage === right.currentMileage &&
    left.refuelAmount === right.refuelAmount &&
    left.unitPrice === right.unitPrice
  );
};

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
    isLoading: false,
    loadFailed: false,
    fuelFormVisible: false,
    editingFuelId: null as number | null,
    originalFuelModel: null as FuelModel | null,
    statisticsData: {
      currentMileage: 0,
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
    if (this.data.isLoading) {
      return;
    }
    this.setData({ isLoading: true });
    ajax
      .get<FuelListResponse>(`/motos/${this.data.motoId}/fuel`)
      .then(({ data }) => {
        const fuelList = data.fuelList.map(record => {
          const refuelDate = util.formatTime(
            new Date(record.refuelDate),
            'date'
          );
          return {
            formValues: {
              currentMileage: String(record.currentMileage),
              refuelAmount: String(record.refuelAmount),
              refuelDate,
              unitPrice: String(record.unitPrice)
            },
            id: record.id,
            currentMileage: record.currentMileage,
            refuelDate,
            refuelAmount: util.fixed2ForNum(record.refuelAmount),
            unitPrice: util.fixed2ForNum(record.unitPrice),
            fuelCount: util.fixed2ForNum(record.fuelCount),
            updatedAt: util
              .formatTime(new Date(record.updatedAt))
              .slice(0, 16)
          };
        });
        this.setData({
          fuelList,
          loadFailed: false,
          statisticsData: data.statisticsData
        });
      })
      .catch(() => {
        this.setData({ loadFailed: true });
      })
      .finally(() => {
        this.setData({ isLoaded: true, isLoading: false });
      });
  },

  handleDataRetry() {
    this._loadFuelList();
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
    this._openFuelForm(null, {
      refuelDate: util.formatTime(new Date(), 'date'),
      currentMileage: '',
      refuelAmount: '',
      unitPrice: ''
    });
  },

  handleEditFuelClick(
    event: WechatMiniprogram.CustomEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { fuelId: number }
    >
  ) {
    const fuelId = Number(event.currentTarget.dataset.fuelId);
    const fuelRecord = this.data.fuelList.find(record => record.id === fuelId);
    if (!fuelRecord) {
      messageBox.toast('加油记录不存在，请刷新后重试');
      return;
    }

    this._openFuelForm(fuelId, fuelRecord.formValues);
  },

  _openFuelForm(editingFuelId: number | null, fuelModel: FuelModel) {
    this.setData({
      editingFuelId,
      fuelErrors: createEmptyFuelErrors(),
      fuelFormVisible: true,
      fuelModel: copyFuelModel(fuelModel),
      originalFuelModel: copyFuelModel(fuelModel),
      keyboardHeight: 0
    });
  },

  handleFuelFormCancel() {
    if (this.data.isSubmitting) {
      return;
    }

    if (!this._hasUnsavedFuelChanges()) {
      this._closeFuelForm();
      return;
    }

    wx.showModal({
      title: this.data.editingFuelId ? '放弃修改？' : '放弃填写？',
      content: '当前内容尚未保存。',
      confirmText: '放弃',
      confirmColor: '#b42318',
      success: result => {
        if (result.confirm) {
          this._closeFuelForm();
        }
      }
    });
  },

  _hasUnsavedFuelChanges(): boolean {
    const originalFuelModel = this.data.originalFuelModel;
    return (
      originalFuelModel !== null &&
      !fuelModelsEqual(this.data.fuelModel, originalFuelModel)
    );
  },

  _closeFuelForm() {
    this.setData({
      editingFuelId: null,
      fuelFormVisible: false,
      keyboardHeight: 0,
      originalFuelModel: null
    });
  },

  handleFuelFormSubmit() {
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
    const editingFuelId = this.data.editingFuelId;
    const data = fuelModel as unknown as WechatMiniprogram.IAnyObject;
    const request =
      editingFuelId === null
        ? ajax.post(`/motos/${this.data.motoId}/fuel`, data)
        : ajax.put(
            `/motos/${this.data.motoId}/fuel/${editingFuelId}`,
            data
          );
    void request
      .then(() => {
        this._closeFuelForm();
        messageBox.success(editingFuelId === null ? '记录已添加' : '修改已保存');
        this._loadFuelList();
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  }
});
