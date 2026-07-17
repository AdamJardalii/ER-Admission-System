import assert from "node:assert/strict";
import test from "node:test";
import { bandFor, news2RiskBand, scoreNews2 } from "../src/lib/vitals.ts";

test("bandFor returns neutral for empty values", () => {
  assert.equal(bandFor("heartRate", null), "neutral");
  assert.equal(bandFor("temperature", NaN), "neutral");
});

test("bandFor temperature bands follow the spec", () => {
  assert.equal(bandFor("temperature", 35), "red");
  assert.equal(bandFor("temperature", 35.1), "amber");
  assert.equal(bandFor("temperature", 36), "amber");
  assert.equal(bandFor("temperature", 36.1), "normal");
  assert.equal(bandFor("temperature", 38), "normal");
  assert.equal(bandFor("temperature", 38.1), "amber");
  assert.equal(bandFor("temperature", 40), "amber");
});

test("bandFor heart rate bands follow the spec", () => {
  assert.equal(bandFor("heartRate", 40), "red");
  assert.equal(bandFor("heartRate", 41), "amber");
  assert.equal(bandFor("heartRate", 50), "amber");
  assert.equal(bandFor("heartRate", 51), "normal");
  assert.equal(bandFor("heartRate", 90), "normal");
  assert.equal(bandFor("heartRate", 91), "amber");
  assert.equal(bandFor("heartRate", 130), "amber");
  assert.equal(bandFor("heartRate", 131), "red");
});

test("bandFor respiratory rate bands follow the spec", () => {
  assert.equal(bandFor("respiratoryRate", 8), "red");
  assert.equal(bandFor("respiratoryRate", 9), "amber");
  assert.equal(bandFor("respiratoryRate", 11), "amber");
  assert.equal(bandFor("respiratoryRate", 12), "normal");
  assert.equal(bandFor("respiratoryRate", 20), "normal");
  assert.equal(bandFor("respiratoryRate", 21), "amber");
  assert.equal(bandFor("respiratoryRate", 24), "amber");
  assert.equal(bandFor("respiratoryRate", 25), "red");
});

test("bandFor SpO2 bands follow the spec", () => {
  assert.equal(bandFor("spo2", 96), "normal");
  assert.equal(bandFor("spo2", 95), "amber");
  assert.equal(bandFor("spo2", 94), "amber");
  assert.equal(bandFor("spo2", 93), "amber");
  assert.equal(bandFor("spo2", 92), "amber");
  assert.equal(bandFor("spo2", 91), "red");
});

test("bandFor systolic BP bands follow the spec", () => {
  assert.equal(bandFor("systolicBp", 90), "red");
  assert.equal(bandFor("systolicBp", 91), "amber");
  assert.equal(bandFor("systolicBp", 110), "amber");
  assert.equal(bandFor("systolicBp", 111), "normal");
  assert.equal(bandFor("systolicBp", 219), "normal");
  assert.equal(bandFor("systolicBp", 220), "red");
});

test("bandFor pain bands follow the spec", () => {
  assert.equal(bandFor("painScore", 0), "normal");
  assert.equal(bandFor("painScore", 3), "normal");
  assert.equal(bandFor("painScore", 4), "amber");
  assert.equal(bandFor("painScore", 6), "amber");
  assert.equal(bandFor("painScore", 7), "red");
  assert.equal(bandFor("painScore", 10), "red");
});

test("bandFor glucose bands follow the spec", () => {
  assert.equal(bandFor("bloodGlucose", 70), "normal");
  assert.equal(bandFor("bloodGlucose", 180), "normal");
  assert.equal(bandFor("bloodGlucose", 53), "red");
  assert.equal(bandFor("bloodGlucose", 251), "red");
  assert.equal(bandFor("bloodGlucose", 60), "amber");
  assert.equal(bandFor("bloodGlucose", 200), "amber");
});

test("news2RiskBand escalates a single parameter scoring 3 to medium", () => {
  // RR 6 scores 3 on its own; total is 3 but risk must be medium, not low.
  const { score, breakdown } = scoreNews2({
    respiratoryRate: 6,
    spo2: 98,
    supplementalO2: false,
    temperature: 37,
    systolicBp: 120,
    heartRate: 70,
    consciousness: "Alert",
  });
  assert.equal(score, 3);
  assert.equal(news2RiskBand(score, breakdown), "medium");
});

test("news2RiskBand bands by total score", () => {
  const low = { respiratoryRate: 0, spo2: 0, supplementalO2: 0, temperature: 0, systolicBp: 0, heartRate: 0, consciousness: 0 };
  assert.equal(news2RiskBand(0, low), "low");
  assert.equal(news2RiskBand(4, low), "low");
  assert.equal(news2RiskBand(5, low), "medium");
  assert.equal(news2RiskBand(6, low), "medium");
  assert.equal(news2RiskBand(7, low), "high");
});
