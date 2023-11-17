const axios = require('axios')

exports.post = async ({ appSdk }, req, res) => {
  /**
   * Requests coming from Modules API have two object properties on body: `params` and `application`.
   * `application` is a copy of your app installed by the merchant,
   * including the properties `data` and `hidden_data` with admin settings configured values.
   * JSON Schema reference for the List Payments module objects:
   * `params`: https://apx-mods.e-com.plus/api/v1/list_payments/schema.json?store_id=100
   * `response`: https://apx-mods.e-com.plus/api/v1/list_payments/response_schema.json?store_id=100
   *
   * Examples in published apps:
   * https://github.com/ecomplus/app-pagarme/blob/master/functions/routes/ecom/modules/list-payments.js
   * https://github.com/ecomplus/app-custom-payment/blob/master/functions/routes/ecom/modules/list-payments.js
   */

  const { params, application } = req.body
  const { storeId } = req
  // setup basic required response object
  const response = {
    payment_gateways: []
  }

  // merge all app options configured by merchant
  const appData = Object.assign({}, application.data, application.hidden_data)

  const isSandbox = false
  console.log('> List Payment #', storeId, isSandbox)

  if (!appData.username || !appData.password) {
    return res.status(409).send({
      error: 'NO_PAGALEVE_KEYS',
      message: 'PAGALEVE credentials undefined'
    })
  }

  const amount = params.amount || {}

  // common payment methods data
  const intermediator = {
    name: 'Pagaleve',
    link: 'https://api.pagaleve.com.br',
    code: 'pagaleve_app'
  }

  const { discount } = appData
  if (discount && discount.value) {
    if (discount.apply_at !== 'freight') {
      // default discount option
      const { value } = discount
      response.discount_option = {
        label: 'Discount in payment',
        value
      }
      // specify the discount type and min amount is optional
      ;['type', 'min_amount'].forEach(prop => {
        if (discount[prop]) {
          response.discount_option[prop] = discount[prop]
        }
      })
    }

    if (amount.total) {
      // check amount value to apply discount
      if (amount.total < discount.min_amount) {
        discount.value = 0
      } else {
        delete discount.min_amount

        // fix local amount object
        const maxDiscount = amount[discount.apply_at || 'subtotal']
        let discountValue
        if (discount.type === 'percentage') {
          discountValue = maxDiscount * discount.value / 100
        } else {
          discountValue = discount.value
          if (discountValue > maxDiscount) {
            discountValue = maxDiscount
          }
        }
        if (discountValue) {
          amount.discount = (amount.discount || 0) + discountValue
          amount.total -= discountValue
          if (amount.total < 0) {
            amount.total = 0
          }
        }
      }
    }
  }
  
  
  const listPaymentMethods = ['payment_link', 'account_deposit']
  // setup payment gateway object
  listPaymentMethods.forEach(paymentMethod => {
    const isLinkPayment = paymentMethod === 'payment_link'
    const methodConfig = (appData[paymentMethod] || {})
    const minAmount = (methodConfig.min_amount || 1)

    let validateAmount = false
    if (amount.total && minAmount) {
      validateAmount = amount.total >= minAmount
    }

    // Workaround for showcase
    const validatePayment = amount.total ? validateAmount : true
    const methodEnable = !methodConfig.disable

    if (validatePayment && methodEnable) {
      const label = methodConfig.label || (isLinkPayment ? 'Pix Parcelado' : 'Pagar com Pix')
      

      const gateway = {
        label,
        icon: methodConfig.icon,
        text: methodConfig.text,
        payment_method: {
          code: isLinkPayment ? 'balance_on_intermediary' : paymentMethod,
          name: `${label} - ${intermediator.name} `
        },
        intermediator
      }
      if (!gateway.icon ) {
        if (isLinkPayment) {
          gateway.icon = 'https://ecom-pagaleve.web.app/pagaleve-parcelado.png'
        } else {
          gateway.icon = 'https://ecom-pagaleve.web.app/pagaleve-pix.png'
        }
      }
      console.log('>>> test:', JSON.stringify(gateway))

      // check available discount by payment method
      if ((discount && discount.value && discount[paymentMethod] !== false)) {
        gateway.discount = {}
        ;['apply_at', 'type', 'value'].forEach(field => {
          gateway.discount[field] = discount[field]
        })
        if (response.discount_option && !response.discount_option.label) {
          response.discount_option.label = label
        }
      }
      response.payment_gateways.push(gateway)
    }
  })

  res.send(response)
}
