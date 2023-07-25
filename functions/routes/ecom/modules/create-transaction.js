const ecomUtils = require('@ecomplus/utils')
const { baseUri } = require('./../../../__env')
const PagaLeveAxios = require('../../../lib/pagaleve/create-access')

exports.post = ({ appSdk, admin }, req, res) => {
  /**
   * Requests coming from Modules API have two object properties on body: `params` and `application`.
   * `application` is a copy of your app installed by the merchant,
   * including the properties `data` and `hidden_data` with admin settings configured values.
   * JSON Schema reference for the Create Transaction module objects:
   * `params`: https://apx-mods.e-com.plus/api/v1/create_transaction/schema.json?store_id=100
   * `response`: https://apx-mods.e-com.plus/api/v1/create_transaction/response_schema.json?store_id=100
   *
   * Examples in published apps:
   * https://github.com/ecomplus/app-pagarme/blob/master/functions/routes/ecom/modules/create-transaction.js
   * https://github.com/ecomplus/app-custom-payment/blob/master/functions/routes/ecom/modules/create-transaction.js
   */

  const { params, application } = req.body
  const { storeId } = req
  // merge all app options configured by merchant
  const appData = Object.assign({}, application.data, application.hidden_data)

  const isSandbox = false

  // create access with axios
  const pagaleveAxios = new PagaLeveAxios(appData.username, appData.password, isSandbox, storeId)

  // setup required `transaction` response object
  const orderId = params.order_id
  const orderNumber = params.order_number
  const { amount, buyer, to, items } = params

  const isPix = params.payment_method.code === 'account_deposit'

  const transactionLink = {
    intermediator: {
      payment_method: params.payment_method
    },
    currency_id: params.currency_id,
    currency_symbol: params.currency_symbol,
    amount: amount.total,
    status: {
      current: 'pending'
    }
  }

  console.log('> Transaction #', storeId, orderId)
  const finalAmount = amount.total
  const finalFreight = amount.freight

  const parseAddress = to => ({
    name: to.name,
    city: to.city,
    state: to.province_code,
    street: to.street,
    zip_code: to.zip,
    neighborhood: to.borough,
    number: String(to.number) || 's/n',
    complement: to.complement || undefined
  })

  const pagaleveTransaction = {
    cancel_url:`https://${params.domain}/app/#/order/${orderNumber}/${orderId}`,
    approve_url:`https://${params.domain}/app/#/order/${orderNumber}/${orderId}`,
    webhook_url: `${baseUri}/pagaleve/webhook?storeId=${storeId}`,
    is_pix_upfront: isPix ? true : false
  }

  pagaleveTransaction.order = {
    reference: orderId,
    description: `Order from E-Com Plus ${orderNumber}`,
    shipping: {
      amount: Math.floor(finalFreight) || 0,
      address: parseAddress(to)
    },
    amount: Math.floor(finalAmount),
    items: [],
    timestamp: new Date().toISOString(),
    type: 'ORDINARY'
  }

  items.forEach(item => {
    if (item.quantity > 0) {
      const objImg = ecomUtils.img(item)
      pagaleveTransaction.order.items.push({
        name: item.name || item.sku,
        sku: item.sku,
        quantity: item.quantity,
        price: Math.floor((item.final_price || item.price)),
        url: `https://${params.domain}`,
        reference: item.product_id,
        image: objImg && objImg.url ? objImg.url : `https://${params.domain}`
      })
    }
  })

  pagaleveTransaction.shopper = {
    cpf: String(buyer.doc_number),
    first_name: buyer.fullname.replace(/\s.*/, ''),
    last_name: buyer.fullname.replace(/[^\s]+\s/, ''),
    email: buyer.email,
    phone: buyer.phone.number,
    billing_address: parseAddress(to) 
  }

  const birthDate = buyer.birth_date
  if (birthDate && birthDate.year && birthDate.day) {
    pagaleveTransaction.birth_date = `${birthDate.year}-` +
      `${birthDate.month.toString().padStart(2, '0')}-` +
      birthDate.day.toString().padStart(2, '0')
  }

  pagaleveAxios.preparing
    .then(() => {
      const { axios } = pagaleveAxios
      console.log('> SendTransaction Pagaleve: ', JSON.stringify(pagaleveTransaction), ' <<')
      // https://axios-http.com/ptbr/docs/req_config
      const validateStatus = function (status) {
        return status >= 200 && status <= 301
      }
      return axios.post('/v1/checkouts', pagaleveTransaction, { 
        maxRedirects: 0,
        validateStatus
      })
    })
    .then(({ data }) => {
      console.log('>> Created transaction <<', JSON.stringify(data))
      transactionLink.payment_link = data.redirect_url || data.checkout_url
      if (isPix && data.timestamp) {
        transactionLink.account_deposit = {
          valid_thru: data.timestamp
        }  
      }
      res.send({
        redirect_to_payment: true,
        transaction: transactionLink
      })
    })
    .catch(error => {
      // try to debug request error
      const errCode = 'Pagaleve_TRANSACTION_ERR'
      console.log(errCode)
      let { message } = error
      const err = new Error(`${errCode} #${storeId} - ${orderId} => ${message}`)
      if (error.response) {
        const { status, data } = error.response
        console.log('Pagaleve error:', status, JSON.stringify(data))
        if (status !== 401 && status !== 403) {
          err.payment = JSON.stringify(transactionLink)
          err.status = status
          if (typeof data === 'object' && data) {
            err.response = JSON.stringify(data)
          } else {
            err.response = data
          }
        } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
          message = data.errors[0].message
        }
      }
      res.status(409)
      res.send({
        error: errCode,
        message
      })
    })
}
