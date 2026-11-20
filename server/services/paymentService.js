const { createHmac, randomUUID, timingSafeEqual } = require('crypto');

function secret() {
  return process.env.PAYMENT_SECRET
    || process.env.RAZORPAY_KEY_SECRET
    || process.env.PAYMENT_WEBHOOK_SECRET
    || (process.env.NODE_ENV === 'test' ? 'learnloop-test-payment-secret' : '');
}

function createSignature(orderId, paymentId) {
  if (!secret()) throw new Error('PAYMENT_SECRET must be configured');
  return createHmac('sha256', secret()).update(`${orderId}|${paymentId}`).digest('hex');
}

function verifySignature(orderId, paymentId, signature) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createSignature(orderId, paymentId), 'hex');
  const provided = Buffer.from(signature, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

async function createProviderOrder({ amount, currency, courseId, userId }) {
  const testMode = process.env.NODE_ENV === 'test' || process.env.PAYMENT_MODE === 'sandbox';
  const provider = process.env.PAYMENT_PROVIDER || 'razorpay';
  if (testMode) {
    const orderId = `test_order_${randomUUID()}`;
    return {
      provider,
      providerOrderId: orderId,
      amount: Number(amount),
      currency,
      checkout: { mode: 'sandbox', paymentId: `test_payment_${randomUUID()}` },
    };
  }

  if (provider === 'razorpay') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials must be configured for live payments');
    }
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100), currency, receipt: `${userId}-${courseId}`,
      }),
    });
    if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status})`);
    const order = await response.json();
    return { provider, providerOrderId: order.id, amount: Number(amount), currency, checkout: order };
  }

  if (provider === 'stripe') {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe credentials must be configured for live payments');
    const params = new URLSearchParams({
      amount: String(Math.round(Number(amount) * 100)),
      currency: currency.toLowerCase(),
      'metadata[course_id]': courseId,
      'metadata[user_id]': userId,
    });
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!response.ok) throw new Error(`Stripe payment intent creation failed (${response.status})`);
    const intent = await response.json();
    return { provider, providerOrderId: intent.id, amount: Number(amount), currency, checkout: intent };
  }
  throw new Error(`Unsupported payment provider: ${provider}`);
}

module.exports = { createProviderOrder, createSignature, verifySignature };
