Component({
  behaviors: ['wx://form-field-group'],

  options: {
    addGlobalClass: true,
  },

  properties: {
    error: {
      type: String,
      value: '',
    },
    label: {
      type: String,
      value: '',
    },
    labelFor: {
      type: String,
      value: '',
    },
    required: {
      type: Boolean,
      value: false,
    },
  },
});
