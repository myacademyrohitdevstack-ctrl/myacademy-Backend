const { test, describe } = require("node:test");
const assert = require("node:assert");
const { money, recalculateFee } = require("../Utils/fees");

describe("Financial Integrity: Money Helper & Decimal Precision", () => {
  test("Normalizes standard positive numbers to 2 decimal places", () => {
    assert.strictEqual(money(100), 100);
    assert.strictEqual(money(100.5), 100.5);
    assert.strictEqual(money(100.555), 100.56);
    assert.strictEqual(money("250.75"), 250.75);
    assert.strictEqual(money(0), 0);
  });

  test("Rejects negative numbers and non-numeric values", () => {
    assert.throws(() => money(-10), /must be a non-negative number/);
    assert.throws(() => money("invalid"), /must be a non-negative number/);
    assert.throws(() => money(NaN), /must be a non-negative number/);
    assert.throws(() => money(Infinity), /must be a non-negative number/);
  });

  test("Prevents floating-point representation drift (e.g., 0.1 + 0.2)", () => {
    const rawSum = 0.1 + 0.2; // 0.30000000000000004
    assert.strictEqual(money(rawSum), 0.3);
  });
});

describe("Financial Integrity: Fee Recalculation & Lifecycle States", () => {
  test("Sets status to 'pending' when no installments are paid", () => {
    const fee = {
      totalPayable: 10000,
      installments: [
        { installmentNumber: 1, amount: 5000, paidAmount: 0, status: "pending", dueDate: new Date(Date.now() + 86400000) },
        { installmentNumber: 2, amount: 5000, paidAmount: 0, status: "pending", dueDate: new Date(Date.now() + 172800000) },
      ],
    };
    recalculateFee(fee);
    assert.strictEqual(fee.paidAmount, 0);
    assert.strictEqual(fee.balanceAmount, 10000);
    assert.strictEqual(fee.status, "pending");
  });

  test("Sets status to 'partial' when partially paid and not overdue", () => {
    const fee = {
      totalPayable: 10000,
      installments: [
        { installmentNumber: 1, amount: 5000, paidAmount: 5000, status: "paid", dueDate: new Date(Date.now() + 86400000) },
        { installmentNumber: 2, amount: 5000, paidAmount: 0, status: "pending", dueDate: new Date(Date.now() + 172800000) },
      ],
    };
    recalculateFee(fee);
    assert.strictEqual(fee.paidAmount, 5000);
    assert.strictEqual(fee.balanceAmount, 5000);
    assert.strictEqual(fee.status, "partial");
  });

  test("Sets status to 'paid' when full amount is settled", () => {
    const fee = {
      totalPayable: 10000,
      installments: [
        { installmentNumber: 1, amount: 5000, paidAmount: 5000, status: "paid", dueDate: new Date(Date.now() - 86400000) },
        { installmentNumber: 2, amount: 5000, paidAmount: 5000, status: "paid", dueDate: new Date(Date.now() + 86400000) },
      ],
    };
    recalculateFee(fee);
    assert.strictEqual(fee.paidAmount, 10000);
    assert.strictEqual(fee.balanceAmount, 0);
    assert.strictEqual(fee.status, "paid");
  });

  test("Sets status to 'overdue' when unpaid installments pass due date", () => {
    const fee = {
      totalPayable: 10000,
      installments: [
        { installmentNumber: 1, amount: 5000, paidAmount: 0, status: "pending", dueDate: new Date(Date.now() - 86400000 * 5) },
        { installmentNumber: 2, amount: 5000, paidAmount: 0, status: "pending", dueDate: new Date(Date.now() + 86400000 * 5) },
      ],
    };
    recalculateFee(fee);
    assert.strictEqual(fee.balanceAmount, 10000);
    assert.strictEqual(fee.status, "overdue");
  });

  test("Handles payment reversal correctly, restoring outstanding balance", () => {
    // Initial state: fully paid
    const fee = {
      totalPayable: 5000,
      installments: [
        { installmentNumber: 1, amount: 5000, paidAmount: 5000, status: "paid", dueDate: new Date(Date.now() + 86400000) },
      ],
    };
    recalculateFee(fee);
    assert.strictEqual(fee.status, "paid");

    // Reverse payment of 5000
    fee.installments[0].paidAmount = 0;
    fee.installments[0].status = "pending";
    recalculateFee(fee);

    assert.strictEqual(fee.paidAmount, 0);
    assert.strictEqual(fee.balanceAmount, 5000);
    assert.strictEqual(fee.status, "pending");
  });
});
