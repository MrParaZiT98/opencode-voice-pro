export function selectMicrophoneDevice(devices, preferred) {
  const available = Array.isArray(devices) ? devices : [];
  const requested = String(preferred ?? "")
    .trim()
    .toLowerCase();

  if (requested) {
    return available.find((name) => name.toLowerCase().includes(requested)) ?? null;
  }

  return available.find((name) => /vankyo|cm7000/i.test(name)) ?? available[0] ?? null;
}
