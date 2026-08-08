Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true
  },

  properties: {
    actionAriaLabel: {
      type: String,
      value: ''
    },
    actionLabel: {
      type: String,
      value: ''
    },
    actionLoading: {
      type: Boolean,
      value: false
    },
    description: {
      type: String,
      value: ''
    },
    padded: {
      type: Boolean,
      value: false
    },
    state: {
      type: String,
      value: 'content'
    },
    stateSize: {
      type: String,
      value: 'page'
    },
    title: {
      type: String,
      value: ''
    }
  },

  methods: {
    handleAction() {
      if (this.data.actionLoading) {
        return;
      }

      this.triggerEvent('action');
    }
  }
});
