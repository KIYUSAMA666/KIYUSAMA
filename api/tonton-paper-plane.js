import { randomUUID } from 'node:crypto';
import { normalizeTontonSignal } from '../kiyusama-device/src/tonton-signal-envelope.js';
import { createExistingWakeHandoff } from '../kiyusama-device/src/tonton-wake-adapter.js';
import { createOsRunnerDispatch } from '../kiyusama-device/src/tonton-os-runner-contract.js';
import { createExistingRunnerSeam } from '../kiyusama-device/src/tonton-existing-runner-seam.js';

function buildPaperPlaneRunner(receiptId) {
  return createExistingRunnerSeam({
    taskSource: async ({ signalId, source, dedupeKey, hint }) => ({
      accepted: true,
      taskId: `paper-plane:${signalId}`,
      source,
      dedupeKey,
      hint,
      content: 'TONTON_PAPER_PLANE_RECEIPT_ONLY',
    }),
    executor: async ({ signalId, task }) => ({
      accepted: true,
      status: 'PAPER_PLANE_NOOP',
      signalId,
      taskId: task.taskId,
    }),
    resultSink: async ({ signalId, task, execution }) => ({
      accepted: true,
      receipt: {
        receiptId,
        signalId,
        taskId: task.taskId,
        executionStatus: execution.status,
        receivedBy: 'KIYUSAMA_OS_PAPER_PLANE_RUNNER',
        recordedAt: new Date().toISOString(),
      },
    }),
  });
}

async function runPipeline(body = {}) {
  const source = String(body.source ?? 'iphone-back-tap').trim();
  const gesture = String(body.gesture ?? 'double-tap').trim();
  const externalId = String(body.externalId ?? randomUUID()).trim();
  const occurredAt = String(body.occurredAt ?? new Date().toISOString());
  if (!source || !externalId) {
    const error = new Error('INVALID_TONTON_SIGNAL');
    error.code = 'INVALID_TONTON_SIGNAL';
    throw error;
  }

  const signal = normalizeTontonSignal({
    source,
    externalId,
    occurredAt,
    hint: { gesture, mode: 'paper-plane' },
  });

  const receiptId = randomUUID();
  const runOs = buildPaperPlaneRunner(receiptId);
  const dispatchWake = createOsRunnerDispatch({ runOs });
  const handoff = createExistingWakeHandoff({ dispatchWake });

  const wakeResult = await handoff({
    signal,
    payload: { hint: { gesture, mode: 'paper-plane' } },
    evidence: {
      physicalIngress: 'HTTPS_POST',
      source,
      gesture,
      occurredAt,
    },
    nextCursor: null,
  });

  const runner = wakeResult?.wakeResult?.runnerResult;
  const osReceipt = runner?.recorded?.receipt ?? null;
  const complete = wakeResult?.accepted === true && runner?.accepted === true && runner?.stage === 'complete' && Boolean(osReceipt);

  return {
    schema: 'tonton-paper-plane/0.2',
    receiptId,
    externalId,
    signalId: signal.id,
    dedupeKey: signal.dedupeKey,
    source,
    gesture,
    occurredAt,
    receivedAt: new Date().toISOString(),
    physicalIngress: 'ACCEPTED',
    tontonWake: wakeResult?.accepted === true ? 'ACCEPTED' : 'REJECTED',
    osDispatch: complete ? 'BOUND' : 'FAILED',
    runnerStage: runner?.stage ?? null,
    osReceipt,
    phase3Pass: complete,
  };
}

export default async function handler(req, res) {
  const selfTest = req.method === 'GET' && req.query?.selftest === '1';
  if (req.method !== 'POST' && !selfTest) {
    res.setHeader('Allow', 'POST, GET?selftest=1');
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const body = selfTest
      ? { source: 'deployment-selftest', gesture: 'synthetic-double-tap', externalId: `selftest-${randomUUID()}` }
      : (req.body && typeof req.body === 'object' ? req.body : {});

    const receipt = await runPipeline(body);
    console.log('TONTON_PAPER_PLANE_PIPELINE', JSON.stringify({ selfTest, ...receipt }));

    return res.status(200).json({
      ok: receipt.phase3Pass === true,
      ack: receipt.phase3Pass === true ? 'TONTON_OS_RECEIPT_ACK' : 'TONTON_PIPELINE_INCOMPLETE',
      selfTest,
      ...receipt,
    });
  } catch (error) {
    console.error('TONTON_PAPER_PLANE_ERROR', error);
    return res.status(500).json({
      ok: false,
      ack: 'TONTON_PIPELINE_ERROR',
      code: error?.code ?? 'TONTON_PIPELINE_ERROR',
      phase3Pass: false,
    });
  }
}
