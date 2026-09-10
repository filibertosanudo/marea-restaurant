/** Thrown when an action that touches the drawer (collecting cash, refunding cash, recording a movement) finds no open CashSession — money that isn't attached to a shift is money a corte can never find. */
export class NoOpenCashSessionError extends Error {
  constructor() {
    super("No open cash session for this business");
    this.name = "NoOpenCashSessionError";
  }
}

/** Thrown by openCashSessionAction when a session is already open — the partial unique index is the real guarantee, this is just a clean error before hitting it. */
export class CashSessionAlreadyOpenError extends Error {
  constructor() {
    super("A cash session is already open for this business");
    this.name = "CashSessionAlreadyOpenError";
  }
}
