/**
 * The platform's fee on a card payment (module 17b, phase 5).
 *
 * There is none today: businesses pay Stripe's own processing fee on their
 * account (`fees_collector: stripe`), and the platform is paid for the software
 * elsewhere. So this returns 0, and a fee of 0 is never sent to Stripe:
 * `application_fee_amount` must be positive, and "zero" is expressed by leaving
 * the parameter out.
 *
 * WHAT TURNING A FEE ON REQUIRES, decided now so it is not decided in a hurry
 * later. Stripe does not return an application fee when a charge is refunded
 * unless the refund asks for it (`refund_application_fee`); left alone, the
 * restaurant would lose the fee on every refund without anyone having chosen
 * that. The policy for this platform is that the platform returns its fee on
 * every refund, in proportion to what is refunded (what Stripe does for a
 * partial refund with `refund_application_fee: true`). Stripe's own processing
 * fee is not returned by Stripe on a refund, on either side; the restaurateur
 * should be told that in the terms, since it is Stripe's rule and not ours.
 *
 * Doing that takes three things, none of which exist yet because the fee is 0:
 * 1. the fee charged is recorded on the Payment row at creation (a refund needs
 *    to know whether there was one, and a later change of rate must not change
 *    what an old payment refunds);
 * 2. `refundOnePayment` sends `refund_application_fee: true` when that recorded
 *    fee is positive;
 * 3. the test below that pins this function to 0 is changed on purpose, in the
 *    same change, which is the point of it.
 */
export function platformFeeAmount(chargeAmount: number): number {
  void chargeAmount;
  return 0;
}

/** The PaymentIntent parameter for a fee, or nothing at all when there is none. */
export function applicationFeeParams(fee: number): { application_fee_amount?: number } {
  return fee > 0 ? { application_fee_amount: fee } : {};
}
