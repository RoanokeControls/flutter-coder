// Verified device-link samples: live telemetry charting, the firmware<->app
// versioned-envelope contract, and the app-side OTA update flow. Every
// `code` field was verified on Flutter 3.44.4 / Dart 3.12.2: `flutter
// analyze` clean (zero errors/warnings/infos). Samples 1 and 3 are runnable
// MaterialApp harnesses backed by fakes; sample 2 is pure Dart whose golden
// fixtures were executed with `dart run --enable-asserts` (all asserts pass).

import type { FlutterSample } from "./types.js";

export const deviceLinkSamples: readonly FlutterSample[] = [
  {
    id: "live-telemetry-chart",
    title: "Live Telemetry Chart: Ring Buffer, Min/Max Downsampling, Hysteresis Autoscale",
    category: "connectivity",
    difficulty: "advanced",
    description:
      "A stream-fed live line chart (fl_chart) built for device telemetry at 1–10 Hz: a fixed-capacity ring buffer over Float64Lists absorbs samples without allocation churn, min/max decimation keeps single-sample spikes visible once the window outgrows the pixel budget, pause freezes the display while the buffer keeps filling, and the y-axis autoscales with grow-fast/shrink-late hysteresis snapped to 1/2/5-decade bounds so labels never jitter. main() drives it with a fake thermocouple stream whose rate slider exercises the whole 1–10 Hz range. Reach for this when a naive setState-per-sample chart starts dropping frames or hiding the spikes the engineer was watching for.",
    tags: ["fl_chart","telemetry","live-chart","time-series","ring-buffer","downsampling","min-max-decimation","autoscale","hysteresis","pause-resume","stream","sensor-data","ble","sample-rate"],
    minFlutter: "3.27",
    packages: [{"name":"fl_chart","version":"^1.2.0"}],
    code: `// Live telemetry chart for a device link. Three problems that are invisible
// in demos and fatal in the field: unbounded point lists (memory creep on an
// 8-hour bench session), nth-point decimation (erases the one spike you were
// watching for), and per-sample y-autoscale (the chart "breathes" at sample
// rate). Ring buffer + min/max downsampling + hysteresis autoscale fix them.
import 'dart:async';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// [t] is seconds on a monotonic clock — wall-clock jumps (phone NTP sync
/// mid-session) would fold the x-axis back on itself.
class Sample {
  const Sample(this.t, this.v);
  final double t, v;
}

/// Fixed-capacity ring buffer over two Float64Lists. Old samples are
/// overwritten in place, never shifted: a growable list with removeAt(0) is
/// O(n) per sample and churns the allocator exactly when the chart paints.
class RingBuffer {
  RingBuffer(this.capacity)
      : _t = Float64List(capacity),
        _v = Float64List(capacity);

  final int capacity;
  final Float64List _t, _v;
  int _next = 0, _length = 0;

  int get length => _length;

  void add(Sample s) {
    _t[_next] = s.t;
    _v[_next] = s.v;
    _next = (_next + 1) % capacity;
    if (_length < capacity) _length++; // wrapped: oldest sample overwritten
  }

  /// i = 0 is the oldest retained sample.
  Sample operator [](int i) =>
      Sample(_t[(_next - _length + i + capacity) % capacity],
          _v[(_next - _length + i + capacity) % capacity]);

  List<Sample> snapshot() => [for (var i = 0; i < _length; i++) this[i]];
}

/// Min/max decimation. When the window holds more samples than the chart has
/// horizontal pixels, skipping every nth point hides single-sample spikes —
/// the readings an engineer is usually watching for. Emitting each bucket's
/// min AND max preserves every excursion, and makes the output's extremes
/// equal the window's true extremes, so the axis scaler can read them off
/// the downsampled list for free.
List<FlSpot> downsample(int n, Sample Function(int) at, int pixelBudget) {
  if (n <= pixelBudget) return [for (var i = 0; i < n; i++) FlSpot(at(i).t, at(i).v)];
  final buckets = math.max(1, pixelBudget ~/ 2); // two spots per bucket
  final out = <FlSpot>[];
  for (var b = 0; b < buckets; b++) {
    final start = b * n ~/ buckets, end = (b + 1) * n ~/ buckets;
    var minI = start, maxI = start;
    for (var i = start + 1; i < end; i++) {
      if (at(i).v < at(minI).v) minI = i;
      if (at(i).v > at(maxI).v) maxI = i;
    }
    // keep time order inside the bucket or the line doubles back on itself
    final a = math.min(minI, maxI), z = math.max(minI, maxI);
    out.add(FlSpot(at(a).t, at(a).v));
    if (z != a) out.add(FlSpot(at(z).t, at(z).v));
  }
  return out;
}

/// Y-autoscale with hysteresis: grow immediately (clipping hides data), but
/// shrink only once data occupies less than [shrinkBelow] of the range — and
/// snap bounds to a 1/2/5-decade grid so near-threshold recomputes reproduce
/// identical bounds instead of flickering through arbitrary decimals.
class AxisScaler {
  AxisScaler({this.shrinkBelow = 0.55});
  final double shrinkBelow;
  double lo = 0, hi = 1, step = 0.5;
  bool _seeded = false;

  void fit(double dataLo, double dataHi) {
    if (dataHi - dataLo < 1e-9) { dataLo -= 1; dataHi += 1; } // flat signal
    final grow = dataLo < lo || dataHi > hi;
    final occupied = (dataHi - dataLo) / (hi - lo);
    if (_seeded && !grow && occupied >= shrinkBelow) return; // hold
    _seeded = true;
    final pad = (dataHi - dataLo) * 0.08;
    final raw = (dataHi - dataLo + 2 * pad) / 5; // aim for ~5 gridlines
    final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
    final norm = raw / mag;
    step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    lo = ((dataLo - pad) / step).floorToDouble() * step;
    hi = ((dataHi + pad) / step).ceilToDouble() * step;
  }
}

/// Fake thermocouple: slow sine + noise + rare 1-sample spikes. The spikes
/// prove min/max downsampling keeps excursions visible. Rate is re-read every
/// iteration, so the slider takes effect without rebuilding the stream.
Stream<Sample> fakeTelemetry(ValueListenable<double> hz) async* {
  final rng = math.Random(7);
  final clock = Stopwatch()..start(); // monotonic, unlike DateTime.now()
  while (true) {
    await Future<void>.delayed(Duration(microseconds: (1e6 / hz.value).round()));
    final t = clock.elapsedMicroseconds / 1e6;
    var v = 225 + 20 * math.sin(t / 9) + (rng.nextDouble() - 0.5) * 3;
    if (rng.nextInt(50) == 0) v += 40 + rng.nextDouble() * 20;
    yield Sample(t, v);
  }
}

AxisTitles _axis(double interval, double size, String Function(double) fmt) =>
    AxisTitles(
        sideTitles: SideTitles(
            showTitles: true,
            reservedSize: size,
            interval: interval,
            getTitlesWidget: (v, meta) =>
                Text(fmt(v), style: const TextStyle(fontSize: 11))));

class TelemetryPage extends StatefulWidget {
  const TelemetryPage({super.key, required this.stream, required this.hz});
  final Stream<Sample> stream;
  final ValueNotifier<double> hz; // 1–10 Hz, shared with the producer

  @override
  State<TelemetryPage> createState() => _TelemetryPageState();
}

class _TelemetryPageState extends State<TelemetryPage> {
  // 4096 samples ≈ 6.8 min at 10 Hz for ~64 KB: a pause can last minutes
  // before resume loses anything off the back of the buffer.
  final RingBuffer _buf = RingBuffer(4096);
  final AxisScaler _scaler = AxisScaler();
  StreamSubscription<Sample>? _sub;
  List<Sample>? _frozen; // non-null while paused: display freezes, buffer doesn't

  @override
  void initState() {
    super.initState();
    _sub = widget.stream.listen((s) {
      _buf.add(s); // unconditional: pausing the display must not drop data
      if (_frozen == null) setState(() {});
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  // Pause = freeze a snapshot (and the axis, by skipping fit). Resume drops
  // the snapshot; the next frame shows everything buffered meanwhile.
  void _togglePause() => setState(() => _frozen = _frozen == null ? _buf.snapshot() : null);

  @override
  Widget build(BuildContext context) {
    final frozen = _frozen;
    return Scaffold(
      appBar: AppBar(title: const Text('Live telemetry — fl_chart')),
      body: Column(children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 16, 24, 8),
            child: LayoutBuilder(builder: (context, constraints) {
              final n = frozen?.length ?? _buf.length;
              Sample at(int i) => frozen == null ? _buf[i] : frozen[i];
              final spots = downsample(n, at, constraints.maxWidth.floor());
              if (spots.length < 2) return const Center(child: Text('waiting for samples…'));
              if (frozen == null) {
                var dLo = spots.first.y, dHi = spots.first.y;
                for (final s in spots) {
                  dLo = math.min(dLo, s.y);
                  dHi = math.max(dHi, s.y);
                }
                _scaler.fit(dLo, dHi); // mutates only the axis cache
              }
              return LineChart(
                // implicit tweens fight live data: they animate toward a
                // target that every incoming sample immediately moves again
                duration: Duration.zero,
                LineChartData(
                  minX: spots.first.x, maxX: spots.last.x,
                  minY: _scaler.lo, maxY: _scaler.hi,
                  clipData: const FlClipData.all(),
                  lineTouchData: const LineTouchData(enabled: false),
                  gridData: FlGridData(
                      drawVerticalLine: false, horizontalInterval: _scaler.step),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(), rightTitles: const AxisTitles(),
                    leftTitles: _axis(_scaler.step, 48,
                        (v) => v.toStringAsFixed(_scaler.step >= 1 ? 0 : 1)),
                    bottomTitles: _axis(
                        math.max(1, (spots.last.x - spots.first.x) / 4), 24,
                        (v) => '\${v.toStringAsFixed(0)}s'),
                  ),
                  lineBarsData: [
                    // isCurved stays false: curves invent values between
                    // real samples, which is lying on a telemetry chart.
                    LineChartBarData(
                        spots: spots,
                        barWidth: 1.5,
                        dotData: const FlDotData(show: false)),
                  ],
                ),
              );
            }),
          ),
        ),
        SafeArea(
          top: false,
          child: Row(children: [
            const SizedBox(width: 8),
            IconButton.filledTonal(
                onPressed: _togglePause,
                tooltip: frozen == null ? 'Freeze display (keeps buffering)' : 'Resume',
                icon: Icon(frozen == null ? Icons.pause : Icons.play_arrow)),
            Expanded(
              child: ValueListenableBuilder<double>(
                valueListenable: widget.hz,
                builder: (context, hz, _) => Slider(
                    value: hz, min: 1, max: 10, divisions: 9,
                    label: '\${hz.toStringAsFixed(0)} Hz',
                    onChanged: (v) => widget.hz.value = v),
              ),
            ),
            Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Text('\${_buf.length}/\${_buf.capacity}')),
          ]),
        ),
      ]),
    );
  }
}

void main() {
  // The rate knob lives outside the tree so the fake stream reads it the
  // way transport code would read a device config — not via BuildContext.
  final hz = ValueNotifier<double>(4);
  runApp(MaterialApp(
    theme: ThemeData(colorSchemeSeed: const Color(0xFF00695C)),
    home: TelemetryPage(stream: fakeTelemetry(hz), hz: hz),
  ));
}`,
    notes:
      "Three failure modes this guards against: (1) unbounded spot lists — a growable list with removeAt(0) is O(n) per sample and keeps the whole session in memory; the ring buffer overwrites in place. (2) nth-point downsampling erases single-sample spikes — min/max decimation emits each bucket's extremes in time order (or the polyline doubles back on itself), and as a side effect the downsampled list's extremes equal the window's true extremes, so the axis scaler reads them for free. (3) per-sample autoscale makes the chart breathe at sample rate — the scaler grows immediately (clipping hides data) but shrinks only below 55% occupancy, and snaps bounds to a 1/2/5-decade grid so near-threshold recomputes reproduce identical limits. fl_chart 1.2.0 specifics: pass duration: Duration.zero or the implicit tween animates toward targets that every sample moves again; horizontalInterval and SideTitles.interval must be > 0 (the scaler's step is always positive, and the bottom axis uses max(1, span/4)); leave isCurved false — curves invent values between real samples. Timestamps come from a Stopwatch, not DateTime.now(): an NTP jump mid-session folds the x-axis back on itself. Pause snapshots the buffer and freezes the axis but never cancels the subscription, so resume shows everything received meanwhile; the chart is only built once 2+ points exist so minX < maxX always holds.",
  },
  {
    id: "protocol-versioned-envelope",
    title: "Versioned Protocol Envelope: CRC16, Sealed Messages, Tolerant Decoding, Capability Bits",
    category: "connectivity",
    difficulty: "expert",
    description:
      "The firmware↔app wire contract as a runnable pure-Dart file: a versioned envelope (magic, version, type, u16 LE length, payload, CRC-16/CCITT-FALSE over header+payload), sealed message classes, and TOLERANT decoding — unknown message types become an UnknownMessage variant, unknown enum ordinals map to .unknown, and newer-firmware payloads with appended fields parse their known prefix. Includes a capability-negotiation message (device reports feature bits, app gates UI on them) and hard-coded golden byte fixtures exercised by asserts in main(), including a 'newer firmware' frame with an unknown message type that must decode gracefully. This is the pattern that lets one app build serve every firmware version alive across Alpha/Beta/Production OTA tiers.",
    tags: ["protocol","wire-format","envelope","crc16","sealed-classes","forward-compatibility","tolerant-decoding","unknown-variant","capability-negotiation","feature-bits","golden-fixtures","binary-parsing","bytedata","endianness","firmware"],
    minFlutter: "3.24",
    packages: [],
    code: `// Versioned wire envelope for a firmware <-> app link, written for a fleet
// where Alpha, Beta, and Production devices speak different ages of "the
// same" protocol. The survival rule this file encodes: reject corruption
// loudly (magic, length, CRC), but never reject novelty — unknown message
// types, unknown enum ordinals, and appended payload fields all come from
// firmware that is merely newer than the app, and must decode into something
// the UI can shrug at instead of throwing.
//
// Pure Dart. Run with \`dart run --enable-asserts <file>\` — plain \`dart run\`
// does NOT enable asserts, which is why main() checks before claiming a pass.
import 'dart:io';
import 'dart:typed_data';

// Envelope: magic | version | type | length (u16 LE) | payload | crc16 (BE).
const int kMagic = 0xA7;
const int kProtocolVersion = 2;
const int _kHeader = 5;

/// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). Bit-serial on purpose:
/// this exact loop also runs on the PIC18 bootloader, where a 512-byte
/// lookup table would not fit. Check value: crc16("123456789") == 0x29B1.
int crc16(List<int> bytes) {
  var crc = 0xFFFF;
  for (final b in bytes) {
    crc ^= (b & 0xFF) << 8;
    for (var i = 0; i < 8; i++) {
      crc = (crc & 0x8000) != 0
          ? ((crc << 1) ^ 0x1021) & 0xFFFF
          : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

Uint8List encodeFrame(int type, List<int> payload,
    {int version = kProtocolVersion}) {
  final f = Uint8List(_kHeader + payload.length + 2);
  f[0] = kMagic;
  f[1] = version;
  f[2] = type;
  f[3] = payload.length & 0xFF; // multi-byte fields are LE, like the MCU
  f[4] = payload.length >> 8;
  f.setRange(_kHeader, _kHeader + payload.length, payload);
  // CRC covers header AND payload: a flipped length byte must fail the
  // check, not silently re-frame the rest of the byte stream.
  final crc = crc16(Uint8List.sublistView(f, 0, f.length - 2));
  f[f.length - 2] = crc >> 8;
  f[f.length - 1] = crc & 0xFF;
  return f;
}

/// Firmware ships new modes to Alpha devices weeks before the app updates.
/// Unrecognized ordinals become [unknown] — the UI renders one field as "—"
/// instead of losing the whole frame to a RangeError.
enum DeviceMode {
  idle,
  heating,
  holding,
  fault,
  unknown;

  static DeviceMode fromWire(int w) =>
      w >= 0 && w < unknown.index ? values[w] : unknown;
}

sealed class DeviceMessage {
  const DeviceMessage();
}

final class Telemetry extends DeviceMessage {
  const Telemetry(
      {required this.millivolts, required this.deciCelsius, required this.mode});

  /// Baseline (v1) layout is exactly 5 bytes: u16 mV | i16 dC | u8 mode.
  /// Anything past byte 4 was appended by newer firmware: readable by newer
  /// apps, invisible to this one. Fields are appended, never reordered or
  /// resized — that is the entire forward-compatibility contract.
  static Telemetry? decode(Uint8List p) {
    if (p.length < 5) return null; // baseline fields are not optional
    final d = ByteData.sublistView(p);
    return Telemetry(
      millivolts: d.getUint16(0, Endian.little),
      deciCelsius: d.getInt16(2, Endian.little),
      mode: DeviceMode.fromWire(d.getUint8(4)),
    );
  }

  final int millivolts;
  final int deciCelsius;
  final DeviceMode mode;
}

final class Capabilities extends DeviceMessage {
  const Capabilities(this.featureBits);

  static Capabilities? decode(Uint8List p) => p.length < 4
      ? null
      : Capabilities(ByteData.sublistView(p).getUint32(0, Endian.little));

  final int featureBits;

  // Known bits. Unknown bits stay set in [featureBits] — never masked off,
  // so logs and bug reports show exactly what the device claimed.
  bool get hasOta => featureBits & 0x0001 != 0;
  bool get hasPidTuning => featureBits & 0x0002 != 0;
  bool get hasFanControl => featureBits & 0x0004 != 0;
}

/// A type this app has no schema for. Kept, not dropped: "unknown message
/// 0x42 from fw 2.4.0-alpha.1" in a bug report pins down a tier mismatch
/// faster than any amount of bench time.
final class UnknownMessage extends DeviceMessage {
  const UnknownMessage(this.type, this.payload);
  final int type;
  final Uint8List payload;
}

sealed class DecodeResult {
  const DecodeResult();
}

final class Decoded extends DecodeResult {
  const Decoded(this.version, this.message);
  final int version;
  final DeviceMessage message;
}

final class BadFrame extends DecodeResult {
  const BadFrame(this.reason);
  final String reason;
}

DecodeResult decodeFrame(Uint8List f) {
  if (f.length < _kHeader + 2) return const BadFrame('truncated');
  if (f[0] != kMagic) return const BadFrame('bad magic');
  final len = f[3] | (f[4] << 8);
  if (f.length != _kHeader + len + 2) return const BadFrame('length mismatch');
  final want = (f[f.length - 2] << 8) | f[f.length - 1];
  if (crc16(Uint8List.sublistView(f, 0, f.length - 2)) != want) {
    return const BadFrame('crc mismatch');
  }
  // The envelope version gates LAYOUT changes only (a v3 might widen the
  // length field). Message evolution rides on tolerant payload decoding, so
  // frames from newer same-layout firmware parse here without a version gate.
  final payload = Uint8List.sublistView(f, _kHeader, _kHeader + len);
  final msg = switch (f[2]) {
    0x01 => Telemetry.decode(payload),
    0x02 => Capabilities.decode(payload),
    _ => UnknownMessage(f[2], Uint8List.fromList(payload)),
  };
  if (msg == null) {
    // Shorter than its own baseline is corruption, not version skew:
    // baseline fields have been mandatory since v1.
    return BadFrame('payload too short for type 0x\${f[2].toRadixString(16)}');
  }
  return Decoded(f[1], msg);
}

/// Capability negotiation, app side: the first frame after connect is the
/// device's Capabilities report, and every optional control is gated on a
/// claimed bit. Gating on capabilities instead of firmware version numbers
/// is what lets one app build serve all three OTA tiers at once.
List<String> visibleControls(Capabilities caps) => [
      'telemetry',
      if (caps.hasOta) 'firmware update',
      if (caps.hasPidTuning) 'PID tuning',
      if (caps.hasFanControl) 'fan curve',
    ];

bool bytesEqual(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

void check(bool cond, String what) {
  assert(cond, what);
  stdout.writeln('  ok: $what');
}

void main() {
  // Refuse to "pass" silently if asserts were compiled out (e.g. \`dart
  // compile exe\` without --enable-asserts).
  var assertsOn = false;
  assert(assertsOn = true);
  if (!assertsOn) {
    stdout.writeln('asserts are disabled — fixtures NOT verified');
    exitCode = 1;
    return;
  }

  check(crc16('123456789'.codeUnits) == 0x29B1, 'CRC-16/CCITT-FALSE self-test');

  // Golden fixtures are hard-coded bytes, not encoder output: they pin the
  // wire format itself, so an accidental layout change breaks a fixture
  // instead of round-tripping invisibly.

  // v2 Telemetry: 3312 mV, 22.5 °C (225 dC), mode 1 = heating.
  const goldenTelemetry = [0xA7, 0x02, 0x01, 0x05, 0x00, 0xF0, 0x0C, 0xE1, 0x00, 0x01, 0x2F, 0xAD];
  check(bytesEqual(encodeFrame(0x01, const [0xF0, 0x0C, 0xE1, 0x00, 0x01]), goldenTelemetry),
      'encoder reproduces golden telemetry frame byte-for-byte');
  final t = decodeFrame(Uint8List.fromList(goldenTelemetry)) as Decoded;
  final tm = t.message as Telemetry;
  check(t.version == 2 && tm.millivolts == 3312 && tm.deciCelsius == 225 && tm.mode == DeviceMode.heating,
      'golden telemetry decodes');

  // "Newer firmware" telemetry: two appended bytes (fan duty, unknown to this
  // app) AND an unknown mode ordinal 7. Both must degrade, not throw.
  const goldenNewerTelemetry = [0xA7, 0x02, 0x01, 0x07, 0x00, 0xF0, 0x0C, 0xE1, 0x00, 0x07, 0x2A, 0x01, 0xFF, 0x54];
  final nt = decodeFrame(Uint8List.fromList(goldenNewerTelemetry)) as Decoded;
  final ntm = nt.message as Telemetry;
  check(ntm.millivolts == 3312 && ntm.mode == DeviceMode.unknown,
      'appended fields ignored, unknown enum -> DeviceMode.unknown');

  // Capabilities: bits 0..1 known (OTA, PID), bit 9 is from newer firmware.
  const goldenCaps = [0xA7, 0x02, 0x02, 0x04, 0x00, 0x03, 0x02, 0x00, 0x00, 0xAD, 0xCF];
  final caps = (decodeFrame(Uint8List.fromList(goldenCaps)) as Decoded).message as Capabilities;
  check(caps.hasOta && caps.hasPidTuning && !caps.hasFanControl && caps.featureBits == 0x0203,
      'feature bits gate UI; unknown bit 9 carried, not stripped');
  check(visibleControls(caps).join(',') == 'telemetry,firmware update,PID tuning',
      'UI gates on claimed capabilities only');

  // "Newer firmware" frame with a message type this app has never heard of.
  const goldenUnknownType = [0xA7, 0x02, 0x42, 0x03, 0x00, 0xDE, 0xAD, 0xBE, 0x4C, 0x0C];
  final u = (decodeFrame(Uint8List.fromList(goldenUnknownType)) as Decoded).message;
  check(u is UnknownMessage && u.type == 0x42 && bytesEqual(u.payload, const [0xDE, 0xAD, 0xBE]),
      'unknown message type -> UnknownMessage, payload preserved');

  // Corruption is still rejected loudly: tolerance is for novelty only.
  final corrupt = Uint8List.fromList(goldenTelemetry)..[6] ^= 0x10;
  check((decodeFrame(corrupt) as BadFrame).reason == 'crc mismatch', 'bit flip -> crc mismatch');
  final short = Uint8List.fromList(goldenTelemetry.sublist(0, 9));
  check((decodeFrame(short) as BadFrame).reason == 'length mismatch', 'truncated frame rejected');

  stdout.writeln('all golden fixtures passed');
}`,
    notes:
      "The rule that keeps one app build alive across every fielded firmware: reject corruption loudly (magic, declared-length mismatch, CRC), never reject novelty. Unknown message types decode to UnknownMessage with the raw payload preserved ('unknown message 0x42 from fw 2.4.0-alpha.1' in a bug report beats bench time); unknown enum ordinals map to a trailing .unknown member — indexing DeviceMode.values straight off the wire throws a RangeError that loses the whole frame over one field the UI could have shown as '—'. Field evolution contract: fields are appended, never reordered or resized, so older apps ignore the tail; payloads SHORTER than the v1 baseline are corruption, not version skew. The CRC covers header AND payload so a flipped length byte fails the check instead of silently re-framing the byte stream (CCITT-FALSE, check value of '123456789' is 0x29B1 — kept as a self-test). The envelope version gates layout changes only; message evolution rides on tolerant payload decoding. Gate UI on capability bits, not firmware-version comparisons, and never mask off unknown bits — logs should show what the device actually claimed. Goldens are hard-coded byte literals, not encoder output, so a layout change breaks a fixture instead of round-tripping invisibly. Run with dart run --enable-asserts: plain dart run does NOT enable asserts (verified on Dart 3.12.2), which is why main() detects assert state via an assignment inside assert() and refuses to print a false pass.",
  },
  {
    id: "ota-update-flow",
    title: "OTA Update Flow: Tiered Manifests, Resumable Download, SHA-256 Gate, Device Handoff States",
    category: "connectivity",
    difficulty: "expert",
    description:
      "App-side OTA update UX for tiered firmware channels: a tier-aware manifest fetch (Alpha/Beta/Production), a from-scratch SemVer implementation with correct prerelease ordering, a chunked download that resumes from the received byte count with exponential backoff, sha256 verification (package:crypto) before any bytes reach the device, and a device-handoff state machine — transfer → flashing → reboot → version confirmation — modeled as sealed states with a timeout on every phase plus bootloader-rollback detection. ManifestSource, FirmwareDownloader, and DeviceLink are interfaces; main() wires in one fake implementing all three (with a deliberate mid-download link drop to exercise resume), so the full flow runs standalone in a MaterialApp harness.",
    tags: ["ota","firmware-update","semver","prerelease","release-channels","alpha-beta-production","manifest","download-resume","retry-backoff","sha256","crypto","sealed-states","state-machine","timeout","rollback-detection","fakes","interfaces"],
    minFlutter: "3.24",
    packages: [{"name":"crypto","version":"^3.0.7"}],
    code: `// App-side OTA flow for devices on tiered firmware channels (Alpha/Beta/
// Production). The app is only the courier: fetch the tier's manifest,
// download with resume (not restart) on link drops, verify sha256 BEFORE
// handing bytes to the device, then observe the device's own flash/reboot
// cycle through sealed states with a deadline on every phase. Manifest,
// downloader, and device hide behind interfaces; main() wires in fakes.
import 'dart:async';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';

/// SemVer with prerelease ordering: a plain string compare calls
/// "2.4.0-alpha.2" newer than "2.4.0" forever, wedging promoted devices.
class SemVer {
  const SemVer(this.major, this.minor, this.patch, [this.pre = const []]);
  final int major, minor, patch;
  final List<String> pre; // prerelease identifiers, empty for releases

  factory SemVer.parse(String s) {
    final dash = s.indexOf('-');
    final c = (dash < 0 ? s : s.substring(0, dash)).split('.');
    if (c.length != 3) throw FormatException('need major.minor.patch: $s');
    return SemVer(int.parse(c[0]), int.parse(c[1]), int.parse(c[2]),
        dash < 0 ? const [] : s.substring(dash + 1).split('.'));
  }

  int compareTo(SemVer o) {
    for (final (a, b) in [(major, o.major), (minor, o.minor), (patch, o.patch)]) {
      if (a != b) return a.compareTo(b);
    }
    if (pre.isEmpty != o.pre.isEmpty) return pre.isEmpty ? 1 : -1; // release > pre
    for (var i = 0; i < pre.length && i < o.pre.length; i++) {
      // Numeric ids compare numerically and below alphanumeric — SemVer §11.
      final a = int.tryParse(pre[i]), b = int.tryParse(o.pre[i]);
      final c = a != null && b != null ? a.compareTo(b)
          : (a == null) == (b == null) ? pre[i].compareTo(o.pre[i]) : (a == null ? 1 : -1);
      if (c != 0) return c;
    }
    return pre.length.compareTo(o.pre.length);
  }

  bool operator >(SemVer o) => compareTo(o) > 0;
  @override
  String toString() => '$major.$minor.$patch\${pre.isEmpty ? '' : '-\${pre.join('.')}'}';
}

enum OtaTier { alpha, beta, production }

class FirmwareManifest {
  const FirmwareManifest(this.version, this.sizeBytes, this.sha256Hex);
  final SemVer version; final int sizeBytes; final String sha256Hex;
}

abstract interface class ManifestSource { Future<FirmwareManifest?> latest(OtaTier tier); }
abstract interface class FirmwareDownloader {
  Stream<List<int>> fetch(FirmwareManifest m, {int offset = 0}); // offset: resume, not restart
}

sealed class DeviceEvent { const DeviceEvent(); }
final class DeviceFlashing extends DeviceEvent { const DeviceFlashing(this.fraction); final double fraction; }
final class DeviceRebooting extends DeviceEvent { const DeviceRebooting(); }
abstract interface class DeviceLink {
  Future<void> sendImage(Uint8List image);
  Stream<DeviceEvent> get events;
  Future<String?> queryVersion(); // null while the device is rebooting
}

// Sealed phases: switches are exhaustiveness-checked, so a new phase breaks
// every screen that forgot to handle it.
sealed class OtaState { const OtaState(); }
final class OtaIdle extends OtaState { const OtaIdle(); }
final class OtaChecking extends OtaState { const OtaChecking(); }
final class OtaUpToDate extends OtaState { const OtaUpToDate(); }
final class OtaDownloading extends OtaState { const OtaDownloading(this.received, this.total); final int received, total; }
final class OtaVerifying extends OtaState { const OtaVerifying(); }
final class OtaTransferring extends OtaState { const OtaTransferring(); }
final class OtaFlashing extends OtaState { const OtaFlashing(this.fraction); final double fraction; }
final class OtaConfirming extends OtaState { const OtaConfirming(); }
final class OtaDone extends OtaState { const OtaDone(this.version); final SemVer version; }
final class OtaFailed extends OtaState { const OtaFailed(this.reason); final String reason; }

class OtaController {
  OtaController(this.manifests, this.downloader, this.device, this.installed);
  final ManifestSource manifests; final FirmwareDownloader downloader; final DeviceLink device;
  SemVer installed; // updated only after the device *confirms* a version
  final ValueNotifier<OtaState> state = ValueNotifier(const OtaIdle());

  Future<void> run(OtaTier tier) async {
    try {
      state.value = const OtaChecking();
      final m = await manifests.latest(tier).timeout(const Duration(seconds: 5));
      if (m == null || !(m.version > installed)) { state.value = const OtaUpToDate(); return; }
      final image = await _download(m);
      state.value = const OtaVerifying();
      // Bootloader checks too, but a bad download caught here costs no flash-erase cycle.
      if (sha256.convert(image).toString() != m.sha256Hex) throw StateError('sha256 mismatch — refusing handoff of corrupt image');
      await _handoff(image, m.version);
    } catch (e) {
      state.value = OtaFailed('$e');
    }
  }

  Future<Uint8List> _download(FirmwareManifest m) async {
    // Whole image in RAM: a streaming hash can't rewind to a drop point, a buffer can.
    final buf = BytesBuilder(copy: true);
    for (var attempt = 0; ; attempt++) {
      try {
        await for (final chunk in downloader.fetch(m, offset: buf.length)) {
          buf.add(chunk);
          state.value = OtaDownloading(buf.length, m.sizeBytes);
        }
        return buf.takeBytes();
      } on Exception {
        if (attempt >= 4) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 250 << attempt));
      }
    }
  }

  Future<void> _handoff(Uint8List image, SemVer target) async {
    state.value = const OtaTransferring();
    await device.sendImage(image).timeout(const Duration(seconds: 60));
    // Device owns the process now; the app observes with per-phase deadlines.
    state.value = const OtaFlashing(0);
    try {
      await for (final e in device.events.timeout(const Duration(seconds: 8))) {
        state.value = switch (e) { DeviceFlashing(:final fraction) => OtaFlashing(fraction), DeviceRebooting() => const OtaConfirming() };
      }
    } on TimeoutException { throw StateError('device went silent mid-flash'); }
    // Poll: unreachable while rebooting, so one immediate query always fails.
    final deadline = DateTime.now().add(const Duration(seconds: 10));
    String? v;
    while ((v = await device.queryVersion()) == null) {
      if (DateTime.now().isAfter(deadline)) throw StateError('no version report after reboot');
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
    final got = SemVer.parse(v!);
    // OLD version after boot = bootloader rollback; never auto-retry it.
    if (got.compareTo(target) != 0) throw StateError('device booted $got, wanted $target (rollback?)');
    installed = got;
    state.value = OtaDone(got);
  }
}

/// One fake behind all three seams. Images are deterministic per version, with
/// the version embedded at byte 0 so the fake device "boots" what it was sent.
class FakeOtaStack implements ManifestSource, FirmwareDownloader, DeviceLink {
  String _installed = '2.3.0';
  String? _staged;
  bool _dropped = false;
  DateTime _reachableAt = DateTime.now();

  static Uint8List imageFor(SemVer v) {
    final name = v.toString().codeUnits;
    return Uint8List(96 * 1024)..fillRange(64, 96 * 1024, 0x5A)..[0] = name.length..setRange(1, 1 + name.length, name);
  }

  @override
  Future<FirmwareManifest?> latest(OtaTier tier) async {
    // Alpha sees candidates; Production only what was promoted through Beta.
    final v = SemVer.parse(switch (tier) { OtaTier.alpha => '2.4.0-alpha.2', OtaTier.beta => '2.3.1-beta.1', OtaTier.production => '2.3.0' });
    final image = imageFor(v);
    return FirmwareManifest(v, image.length, sha256.convert(image).toString());
  }

  @override
  Stream<List<int>> fetch(FirmwareManifest m, {int offset = 0}) async* {
    final image = imageFor(m.version);
    for (var i = offset; i < image.length; i += 8192) {
      await Future<void>.delayed(const Duration(milliseconds: 30));
      // drop once mid-transfer to exercise the resume path
      if (!_dropped && i > image.length * 0.4) { _dropped = true; throw Exception('link dropped'); }
      yield Uint8List.sublistView(image, i, i + 8192 > image.length ? image.length : i + 8192);
    }
  }

  @override
  Future<void> sendImage(Uint8List image) async {
    await Future<void>.delayed(const Duration(seconds: 1));
    _staged = String.fromCharCodes(image.sublist(1, 1 + image[0]));
  }

  @override
  Stream<DeviceEvent> get events async* {
    for (var f = 0.25; f <= 1.0; f += 0.25) {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      yield DeviceFlashing(f);
    }
    yield const DeviceRebooting();
    _reachableAt = DateTime.now().add(const Duration(milliseconds: 1500));
    if (_staged != null) _installed = _staged!; // "flash" commits the image
  }

  @override
  Future<String?> queryVersion() => Future.delayed(const Duration(milliseconds: 100),
      () => DateTime.now().isBefore(_reachableAt) ? null : _installed);
}

String otaLabel(OtaState s, SemVer installed) => switch (s) {
      OtaIdle() => 'Installed $installed — idle',
      OtaChecking() => 'Checking manifest…',
      OtaUpToDate() => 'Installed $installed — up to date for this tier',
      OtaDownloading(:final received, :final total) => 'Downloading \${received ~/ 1024}/\${total ~/ 1024} KB',
      OtaVerifying() => 'Verifying sha256…',
      OtaTransferring() => 'Transferring image to device…',
      OtaFlashing() => 'Device flashing (do not power off)…',
      OtaConfirming() => 'Rebooting — waiting for version report…',
      OtaDone(:final version) => 'Updated to $version',
      OtaFailed(:final reason) => 'Failed: $reason',
    };
double? otaProgress(OtaState s) => switch (s) {
      OtaDownloading(:final received, :final total) => received / total,
      OtaFlashing(:final fraction) => fraction,
      _ => null, // checking/verifying/rebooting have no meaningful fraction
    };

void main() {
  final stack = FakeOtaStack();
  final ota = OtaController(stack, stack, stack, SemVer.parse('2.3.0'));
  final tier = ValueNotifier(OtaTier.production);
  runApp(MaterialApp(
    theme: ThemeData(colorSchemeSeed: const Color(0xFF37474F)),
    home: Scaffold(
      appBar: AppBar(title: const Text('Firmware update')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: ListenableBuilder( // one rebuild scope for state + tier
          listenable: Listenable.merge([ota.state, tier]),
          builder: (context, _) {
            final s = ota.state.value;
            final busy = switch (s) { OtaIdle() || OtaUpToDate() || OtaDone() || OtaFailed() => false, _ => true };
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SegmentedButton<OtaTier>(
                segments: [for (final t in OtaTier.values) ButtonSegment(value: t, label: Text(t.name))],
                selected: {tier.value}, onSelectionChanged: busy ? null : (sel) => tier.value = sel.first,
              ),
              const SizedBox(height: 24),
              Text(otaLabel(s, ota.installed)),
              const SizedBox(height: 12),
              if (otaProgress(s) case final p?) LinearProgressIndicator(value: p),
              const Spacer(),
              FilledButton(onPressed: busy ? null : () => ota.run(tier.value), child: const Text('Check for update')),
            ]);
          },
        ),
      ),
    ),
  ));
}`,
    notes:
      "SemVer prerelease ordering is load-bearing under OTA tiers: a string compare calls 2.4.0-alpha.2 'newer' than 2.4.0 forever, wedging any device promoted from Alpha to a stable tier; numeric prerelease ids compare numerically (alpha.10 > alpha.9) and sort below alphanumeric ones per SemVer §11 — both easy to get backwards. Downloads resume, never restart: the BytesBuilder keeps every received byte and the next fetch starts at buf.length — which is also why sha256 runs once over the buffered image instead of streaming (a chunked hash cannot rewind to the drop point after a resume). Verify BEFORE handoff: the device bootloader would catch a corrupt image too, but only after a full transfer and a flash-erase cycle. After sendImage the device owns the process — the app only observes, with a separate timeout per phase because a stalled flash and a boot loop are different failures needing different guidance; version confirmation POLLS with a deadline because the device is unreachable while rebooting, so a single immediate query would always fail. A device that boots but reports the OLD version means the bootloader rolled back — surface it and never auto-retry, the same image will just roll back again. controller.installed updates only after the device confirms the new version; every switch over the sealed OtaState set is exhaustive, so adding a phase is a compile error in each screen; the tier selector and button disable while busy so a second run() cannot interleave with a live handoff.",
  },
];
