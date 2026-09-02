import {
  type ClaimLightBundle,
  type CompressedAccountMetaLike,
  type LightSerializationKind,
  type LightSerializedValue,
  type RegisterLightBundle,
  type SendLightBundle,
  getLightSerializedValueSerializationKind,
} from '../light/lightClient.ts';
import {
  buildClaimLightInputs,
  buildRegisterLightInputs,
  buildSendLightInputs,
  type SerializedLightInputs,
  type TaggedLightSerializationInput,
} from './stealthLightSerialization.ts';

type AnyLightBundle = RegisterLightBundle | SendLightBundle | ClaimLightBundle;

function describeLightValue(label: string, item: LightSerializedValue): string {
  const kind =
    item.status === 'ready'
      ? `, serializationKind=${getLightSerializedValueSerializationKind(item) ?? 'canonical'}`
      : '';

  return `${label}: status=${item.status}, note=${item.note}${kind}`;
}

function formatBlockingReasons(bundle: AnyLightBundle): string {
  if (!bundle.blockingReasons || bundle.blockingReasons.length === 0) {
    return 'unknown reason';
  }

  return bundle.blockingReasons.join(' | ');
}

function assertBundleReady(
  kind: 'register' | 'send' | 'claim',
  bundle: AnyLightBundle
): void {
  if (bundle.status !== 'ready') {
    throw new Error(
      [
        `Bundle Light dla ${kind} nie jest gotowy.`,
        `Status bundle: ${bundle.status}`,
        `Powody blokady: ${formatBlockingReasons(bundle)}`,
      ].join(' ')
    );
  }
}

function toTaggedReadyInput(
  label: string,
  item: LightSerializedValue
): TaggedLightSerializationInput {
  if (item.status !== 'ready') {
    throw new Error(
      `${label} nie jest gotowe z warstwy Light. ${describeLightValue(label, item)}`
    );
  }

  if (!item.value || item.value.length === 0) {
    throw new Error(
      `${label} ma status=ready, ale nie zawiera serialized bytes. ${describeLightValue(
        label,
        item
      )}`
    );
  }

  const serializationKind =
    getLightSerializedValueSerializationKind(item) ?? ('canonical' as LightSerializationKind);

  return {
    bytes: item.value,
    serializationKind:
      serializationKind === 'placeholder' ? 'canonical' : serializationKind,
    note: item.note,
  };
}

export function requireReadyLightValue(
  label: string,
  item: LightSerializedValue
): Uint8Array {
  return toTaggedReadyInput(label, item).bytes as Uint8Array;
}

export function requireReadyLightValueInput(
  label: string,
  item: LightSerializedValue
): TaggedLightSerializationInput {
  return toTaggedReadyInput(label, item);
}

export function optionalReadyLightValue(
  _label: string,
  item?: LightSerializedValue | null
): Uint8Array | null {
  if (!item) {
    return null;
  }

  if (item.status !== 'ready') {
    return null;
  }

  if (!item.value || item.value.length === 0) {
    return null;
  }

  return item.value;
}

export function optionalReadyLightValueInput(
  _label: string,
  item?: LightSerializedValue | null
): TaggedLightSerializationInput | null {
  if (!item) {
    return null;
  }

  if (item.status !== 'ready') {
    return null;
  }

  if (!item.value || item.value.length === 0) {
    return null;
  }

  const serializationKind =
    getLightSerializedValueSerializationKind(item) ?? ('canonical' as LightSerializationKind);

  return {
    bytes: item.value,
    serializationKind:
      serializationKind === 'placeholder' ? 'canonical' : serializationKind,
    note: item.note,
  };
}

export function requireReadyCompressedMeta(
  label: string,
  item: CompressedAccountMetaLike
): Uint8Array {
  return requireReadyLightValue(label, item);
}

export function requireReadyCompressedMetaInput(
  label: string,
  item: CompressedAccountMetaLike
): TaggedLightSerializationInput {
  return requireReadyLightValueInput(label, item);
}

export function buildRegisterLightInputsFromBundle(
  bundle: RegisterLightBundle
): SerializedLightInputs {
  assertBundleReady('register', bundle);

  return buildRegisterLightInputs({
    proof: requireReadyLightValueInput('register.validityProof', bundle.validityProof),
    addressTreeInfo: requireReadyLightValueInput(
      'register.packedAddressTreeInfo',
      bundle.packedAddressTreeInfo
    ),
    maybeNewAddress: requireReadyLightValueInput('register.newAddress', bundle.newAddress),
    metaMeta: optionalReadyLightValueInput('register.metaMeta', bundle.metaMeta),
  });
}

export function buildSendLightInputsFromBundle(
  bundle: SendLightBundle
): SerializedLightInputs {
  assertBundleReady('send', bundle);

  return buildSendLightInputs({
    proof: requireReadyLightValueInput('send.validityProof', bundle.validityProof),
    addressTreeInfo: requireReadyLightValueInput(
      'send.packedAddressTreeInfo',
      bundle.packedAddressTreeInfo
    ),
    maybeNewPaymentAddress: requireReadyLightValueInput(
      'send.newPaymentAddress',
      bundle.newPaymentAddress
    ),
  });
}

export function buildClaimLightInputsFromBundle(
  bundle: ClaimLightBundle
): SerializedLightInputs {
  assertBundleReady('claim', bundle);

  return buildClaimLightInputs({
    proof: requireReadyLightValueInput('claim.validityProof', bundle.validityProof),
    claimerMeta: requireReadyCompressedMetaInput('claim.claimerMeta', bundle.claimerMeta),
    paymentMeta: requireReadyCompressedMetaInput('claim.paymentMeta', bundle.paymentMeta),
  });
}

export function summarizeMissingLightBundleParts(params: {
  kind: 'register' | 'send' | 'claim';
  bundle: RegisterLightBundle | SendLightBundle | ClaimLightBundle;
}): string[] {
  const missing: string[] = [];

  const check = (label: string, item: LightSerializedValue) => {
    if (item.status !== 'ready') {
      missing.push(`${label}: status=${item.status}, note=${item.note}`);
      return;
    }

    if (!item.value || item.value.length === 0) {
      missing.push(`${label}: brak serialized bytes`);
    }
  };

  switch (params.kind) {
    case 'register': {
      const { bundle } = params;
      check('register.validityProof', bundle.validityProof);
      check('register.packedAddressTreeInfo', bundle.packedAddressTreeInfo);
      check('register.newAddress', bundle.newAddress);

      /**
       * metaMeta jest zachowane jako optional path dla serializer/factory.
       * Jeśli będzie ready, zostanie użyte.
       * Jeśli nie będzie ready, nie traktujemy tego tu jako twardy brak,
       * dopóki wyższa warstwa nie zacznie go wymagać bezwarunkowo.
       */
      if (
        bundle.metaMeta.status === 'ready' &&
        (!bundle.metaMeta.value || bundle.metaMeta.value.length === 0)
      ) {
        missing.push('register.metaMeta: status=ready, ale brak serialized bytes');
      }

      break;
    }

    case 'send': {
      const { bundle } = params;
      check('send.validityProof', bundle.validityProof);
      check('send.packedAddressTreeInfo', bundle.packedAddressTreeInfo);
      check('send.newPaymentAddress', bundle.newPaymentAddress);
      break;
    }

    case 'claim': {
      const { bundle } = params;
      check('claim.validityProof', bundle.validityProof);
      check('claim.claimerMeta', bundle.claimerMeta);
      check('claim.paymentMeta', bundle.paymentMeta);
      break;
    }
  }

  return missing;
}
