Component({
  behaviors: ['wx://form-field-button'],

  properties: {
    label: {
      type: String,
      value: '',
    },
    variant: {
      type: String,
      value: 'primary',
    },
    loading: {
      type: Boolean,
      value: false,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    formType: {
      type: String,
      value: '',
    },
    openType: {
      type: String,
      value: '',
    },
    ariaLabel: {
      type: String,
      value: '',
    },
  },

  methods: {
    handleTap() {
      if (this.data.disabled || this.data.loading) {
        return;
      }

      this.triggerEvent('tap');
    },

    handleAgreePrivacyAuthorization(event: WechatMiniprogram.CustomEvent) {
      this.triggerEvent('agreeprivacyauthorization', event.detail);
    },
  },
});
