// Verified advanced samples: connectivity (BLE, MQTT, SoftAP provisioning,
// USB serial) -- companion-app <-> microcontroller links. Every `code` field
// compiled clean under flutter analyze on Flutter 3.44.4 / Dart 3.12.2 with
// the pinned package versions; pure-Dart logic (line framer, ring buffer,
// provisioning wizard, fake serial link) is additionally covered by unit
// tests run against these exact sources.

import type { FlutterSample } from "./types.js";

export const connectivitySamples: readonly FlutterSample[] = [
  {
    id: "ble-device-session",
    title: "BLE Device Session: Sealed-State Machine with Reconnect, Notify, and Write-With-Response",
    category: "connectivity",
    difficulty: "expert",
    description:
      "A complete flutter_blue_plus device session done right: scan filtered by service UUID, connect with timeout, service/characteristic discovery, notify subscription for telemetry, a write-with-response command path, and an explicit reconnect state machine over sealed states with capped exponential backoff -- plus adapter-state (off/unauthorized) handling and MTU negotiation awareness. Reach for it as the skeleton of any companion app talking to an ESP32/NimBLE (or Nordic) custom GATT service; the sealed states keep the UI honest about what the radio is actually doing.",
    tags: ["ble", "bluetooth", "flutter-blue-plus", "gatt", "scan-filter", "sealed-class", "state-machine", "reconnect", "exponential-backoff", "mtu", "notify", "write-with-response", "esp32", "nimble", "adapter-state"],
    minFlutter: "3.10",
    packages: [{ name: "flutter_blue_plus", version: "^2.3.10" }],
    code: `// BLE device session for a custom ESP32/NimBLE GATT service, modeled as an
// explicit state machine: every path a real link takes -- adapter off, scan
// miss, connect timeout, mid-session drop -- lands in exactly one sealed
// state, so the UI can never show "connected" while the radio disagrees.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

// Nordic-UART-style custom service. The firmware must put this 128-bit UUID
// in the *advertising PDU*, not only the scan response: iOS matches filters
// against the advertisement, so a scan-response-only UUID is invisible.
final Guid kServiceUuid = Guid('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
final Guid kCommandUuid = Guid('6e400002-b5a3-f393-e0a9-e50e24dcca9e'); // write
final Guid kTelemetryUuid = Guid('6e400003-b5a3-f393-e0a9-e50e24dcca9e'); // notify

sealed class SessionState { const SessionState(); }
class SessionIdle extends SessionState { const SessionIdle(); }
class SessionScanning extends SessionState { const SessionScanning(); }
class SessionConnecting extends SessionState {
  const SessionConnecting(this.attempt); final int attempt;
}
class SessionReady extends SessionState {
  const SessionReady(this.mtu); final int mtu;
}
class SessionReconnecting extends SessionState {
  const SessionReconnecting(this.attempt, this.delay);
  final int attempt; final Duration delay;
}
class SessionFailed extends SessionState {
  const SessionFailed(this.reason); final String reason;
}
/// \`unauthorized\` is a permission problem (Info.plist key / Android 12+
/// runtime grant), not a radio problem -- surface it differently than \`off\`.
class SessionAdapterUnavailable extends SessionState {
  const SessionAdapterUnavailable(this.adapter); final BluetoothAdapterState adapter;
}

class DeviceSession {
  static const _maxAttempts = 6;

  final state = ValueNotifier<SessionState>(const SessionIdle());
  final _telemetry = StreamController<List<int>>.broadcast();
  Stream<List<int>> get telemetry => _telemetry.stream;

  BluetoothDevice? _device;
  BluetoothCharacteristic? _command;
  StreamSubscription<List<int>>? _notifySub;
  StreamSubscription<BluetoothConnectionState>? _connSub;
  Timer? _retryTimer;
  int _attempt = 0;
  bool _closing = false; // suppresses reconnect during intentional teardown

  Future<void> start() async {
    // The adapter stream opens with \`unknown\` while CoreBluetooth is still
    // powering up; scanning in that window throws. Wait for a verdict.
    final adapter = await FlutterBluePlus.adapterState.firstWhere((s) => s != BluetoothAdapterState.unknown);
    if (adapter != BluetoothAdapterState.on) {
      state.value = SessionAdapterUnavailable(adapter);
      return;
    }
    await _scan();
  }

  Future<void> _scan() async {
    state.value = const SessionScanning();
    // Filter in the controller (withServices), not in Dart: Android throttles
    // unfiltered scans, and the filter stops the radio waking us per beacon.
    try {
      await FlutterBluePlus.startScan(
          withServices: [kServiceUuid], timeout: const Duration(seconds: 10));
      // scanResults (unlike onScanResults) replays the current scan's hits on
      // subscribe, so listening *after* startScan cannot miss a fast
      // advertiser -- ESP32s beacon every ~100 ms and win that race.
      final hits = await FlutterBluePlus.scanResults
          .firstWhere((r) => r.isNotEmpty).timeout(const Duration(seconds: 10));
      _device = hits.last.device;
    } on TimeoutException {
      state.value = const SessionFailed('no advertising device found');
      return;
    } catch (e) {
      state.value = SessionFailed('scan failed: $e');
      return;
    } finally {
      // Stop scanning *before* connecting: on Android scanner and initiator
      // share the radio; connecting mid-scan is the classic GATT-133 source.
      await FlutterBluePlus.stopScan();
    }
    await _connect();
  }

  Future<void> _connect() async {
    final device = _device;
    if (device == null || _closing) return;
    if (FlutterBluePlus.adapterStateNow != BluetoothAdapterState.on) {
      state.value = SessionAdapterUnavailable(FlutterBluePlus.adapterStateNow);
      return;
    }
    _attempt++;
    state.value = SessionConnecting(_attempt);
    try {
      // fbp 2.x: \`license\` is mandatory (dual-licensed since v2 -- nonprofit
      // free, commercial paid). mtu:512 (the default) asks Android for the
      // max ATT MTU up front; iOS negotiates on its own. The negotiated value
      // is min(central, peripheral) -- NimBLE ships 256 unless
      // ble_att_set_preferred_mtu() raised it -- so read mtuNow, never assume.
      await device.connect(license: License.nonprofit, timeout: const Duration(seconds: 15));
    } catch (e) {
      _scheduleReconnect('connect: $e');
      return;
    }

    // Arm drop detection *before* discovery so a disconnect mid-discovery
    // routes through reconnect instead of leaving half-initialized handles.
    // connectionState replays the current value on listen -- \`connected\`
    // right after connect() -- so this cannot self-trigger.
    await _connSub?.cancel();
    _connSub = device.connectionState.listen((s) {
      if (s == BluetoothConnectionState.disconnected && !_closing) {
        _scheduleReconnect(device.disconnectReason?.description ?? 'link lost');
      }
    });

    try {
      // Handles are invalidated by every reconnect; cached characteristic
      // objects from a previous connection are stale.
      final services = await device.discoverServices();
      final svc = services.firstWhere((s) => s.uuid == kServiceUuid);
      final tele = svc.characteristics.firstWhere((c) => c.uuid == kTelemetryUuid);
      _command = svc.characteristics.firstWhere((c) => c.uuid == kCommandUuid);

      // Listen BEFORE setNotifyValue: firmware often fires its first
      // notification the instant the CCCD write lands, and onValueReceived
      // does not replay missed values (unlike lastValueStream, which replays
      // its cache and would also feed us our own reads/writes).
      await _notifySub?.cancel();
      _notifySub = tele.onValueReceived.listen(_telemetry.add);
      device.cancelWhenDisconnected(_notifySub!);
      await tele.setNotifyValue(true);

      _attempt = 0;
      state.value = SessionReady(device.mtuNow);
    } catch (e) {
      _scheduleReconnect('discovery: $e');
    }
  }

  void _scheduleReconnect(String cause) {
    if (_closing || _retryTimer?.isActive == true) return;
    _notifySub?.cancel();
    _notifySub = null;
    _command = null;
    if (_attempt >= _maxAttempts) {
      state.value = SessionFailed('gave up after $_maxAttempts tries: $cause');
      return;
    }
    // Capped exponential backoff. Android fails instantly (status 133) when
    // the radio is saturated; a tight retry loop makes that window *longer*.
    // _attempt is 0 after a healthy session dropped, so that retry is fast.
    final delay = Duration(milliseconds: 500 * (1 << _attempt.clamp(0, 5)));
    state.value = SessionReconnecting(_attempt + 1, delay);
    _retryTimer = Timer(delay, _connect);
  }

  /// Write-with-response: the Future completes only after the peripheral's
  /// ATT acknowledgment -- completion means the firmware saw the bytes. Use
  /// writeWithoutResponse only for self-metered high-rate streaming. Payload
  /// must fit in mtuNow - 3 (ATT opcode + handle overhead).
  Future<void> sendCommand(List<int> payload) async {
    final c = _command;
    if (state.value is! SessionReady || c == null) {
      throw StateError('session not ready');
    }
    await c.write(payload);
  }

  Future<void> close() async {
    _closing = true;
    _retryTimer?.cancel();
    await _notifySub?.cancel();
    await _connSub?.cancel();
    await _device?.disconnect();
    await _telemetry.close();
    state.value = const SessionIdle();
  }
}

void main() => runApp(const _Harness());

class _Harness extends StatefulWidget {
  const _Harness();
  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  final _session = DeviceSession();

  @override
  void dispose() {
    _session.close();
    super.dispose();
  }

  String _describe(SessionState s) => switch (s) {
        SessionIdle() => 'idle',
        SessionAdapterUnavailable(:final adapter) => 'adapter: $adapter',
        SessionScanning() => 'scanning for service...',
        SessionConnecting(:final attempt) => 'connecting (attempt $attempt)',
        SessionReady(:final mtu) => 'ready -- MTU $mtu (payload \${mtu - 3})',
        SessionReconnecting(:final attempt, :final delay) => 'reconnect #$attempt in \${delay.inMilliseconds} ms',
        SessionFailed(:final reason) => 'failed: $reason',
      };

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('BLE Device Session')),
        body: Center(
          child: ValueListenableBuilder<SessionState>(
            valueListenable: _session.state,
            builder: (context, s, _) => Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(_describe(s)),
                StreamBuilder<List<int>>(
                  stream: _session.telemetry,
                  builder: (context, snap) => Text(snap.hasData ? 'last packet: \${snap.data!.length} B' : 'no telemetry yet'),
                ),
                FilledButton(
                  onPressed: s is SessionIdle || s is SessionFailed ? _session.start : null,
                  child: const Text('Connect'),
                ),
                TextButton(
                  // Fire-and-forget writes race link drops; an error sink
                  // keeps the rejected Future from crashing a debug build.
                  onPressed: s is SessionReady
                      ? () => _session.sendCommand([0x01, 0x2A]).onError((e, _) => debugPrint('tx failed: $e'))
                      : null,
                  child: const Text('Send ping'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
`,
    notes:
      "flutter_blue_plus 2.x is dual-licensed and connect() now REQUIRES a license parameter: License.nonprofit (free for personal/nonprofit/educational use) or License.commercial (paid) -- every 1.x call site breaks, and License.free is a deprecated alias for nonprofit. Platform setup: Android 12+ needs BLUETOOTH_SCAN (with neverForLocation) and BLUETOOTH_CONNECT in the manifest; iOS/macOS need NSBluetoothAlwaysUsageDescription -- a missing key surfaces as adapterState `unauthorized`, which this sample maps to SessionAdapterUnavailable instead of crashing (on a desktop with no BLE adapter the harness parks there by design). Firmware side: the 128-bit service UUID must be in the advertising PDU, not just the scan response, or filtered scans (especially iOS) never see the device. Order matters twice: stop the scan before connecting (connecting mid-scan is the classic source of Android GATT error 133), and listen to onValueReceived BEFORE setNotifyValue(true) or the first notification is silently lost -- and use onValueReceived, not lastValueStream, which replays its cache and echoes your own writes. MTU: usable payload is negotiated MTU minus 3 (ATT header); the negotiated value is min(central, peripheral), so read device.mtuNow -- NimBLE defaults to 256 unless the firmware raised it. connect(autoConnect: true) is incompatible with the MTU request (pass mtu: null and request it yourself). Verified with flutter analyze on Flutter 3.44.4 / flutter_blue_plus 2.3.10: zero issues.",
  },
  {
    id: "mqtt-telemetry-client",
    title: "MQTT Telemetry Client: Jittered Backoff, Last Will, and a Typed Broadcast Stream",
    category: "connectivity",
    difficulty: "advanced",
    description:
      "An mqtt_client wrapper for a bench fleet of ESP32 publishers: manual reconnect with exponential backoff plus full jitter (instead of the package's fixed-schedule autoReconnect), a retained Last Will so firmware learns the app died without its own timeout logic, QoS-0 telemetry decoded from JSON into a typed broadcast stream that survives malformed frames, a QoS-1 command path, and connection state exposed as a ValueListenable for the UI. Reach for it whenever a companion app subscribes to device telemetry over MQTT and must stay glued together across broker restarts.",
    tags: ["mqtt", "mqtt-client", "telemetry", "last-will", "lwt", "qos", "reconnect", "exponential-backoff", "jitter", "broadcast-stream", "valuelistenable", "json", "esp32", "broker"],
    minFlutter: "3.32",
    packages: [{ name: "mqtt_client", version: "^10.11.11" }],
    code: `// MQTT telemetry client for a fleet of bench devices (ESP32s publishing JSON
// once a second). Owns its reconnect policy -- exponential backoff with full
// jitter -- instead of mqtt_client's autoReconnect, exposes connection state
// as a ValueListenable for the UI, and turns raw payloads into a typed
// broadcast stream that survives malformed frames.
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

class Telemetry {
  const Telemetry(
      {required this.deviceId, required this.tempC, required this.heapFree});
  final String deviceId;
  final double tempC;
  final int heapFree;

  factory Telemetry.fromJson(Map<String, dynamic> j) => Telemetry(
        deviceId: j['id'] as String,
        tempC: (j['temp_c'] as num).toDouble(),
        heapFree: j['heap'] as int,
      );
}

class MqttTelemetryClient {
  MqttTelemetryClient({required this.host, required this.clientId});

  final String host;
  final String clientId;

  /// UI binds to this; MqttConnectionState is the package's own enum so the
  /// widget layer can distinguish connecting from disconnected.
  final ValueNotifier<MqttConnectionState> connection =
      ValueNotifier(MqttConnectionState.disconnected);

  final _telemetry = StreamController<Telemetry>.broadcast();
  Stream<Telemetry> get telemetry => _telemetry.stream;
  int droppedFrames = 0;

  static const _telemetryTopic = 'bench/+/telemetry';
  static const _statusTopic = 'bench/app/status';

  MqttServerClient? _client;
  StreamSubscription<List<MqttReceivedMessage<MqttMessage>>>? _updatesSub;
  Timer? _retry;
  int _attempt = 0;
  bool _closing = false;
  final _rng = Random();

  Future<void> start() => _connect();

  Future<void> _connect() async {
    if (_closing) return;
    final client = MqttServerClient(host, clientId)
      ..port = 1883
      ..setProtocolV311()
      // 20 s keepalive: the broker declares us dead at 1.5x this, so a wedged
      // link is noticed in ~30 s without chatty pings that keep phone radios
      // awake. Match what your firmware uses so presence timing is symmetric.
      ..keepAlivePeriod = 20
      // We do our own retry: autoReconnect retries on a fixed schedule with
      // no jitter, so a fleet of clients dropped by one broker restart all
      // come back in lockstep and stampede it.
      ..autoReconnect = false
      ..onDisconnected = _onDisconnected;

    // Last Will: the broker publishes this *for us* if the TCP session dies
    // without a clean DISCONNECT -- firmware subscribed to the status topic
    // learns the operator app vanished without running its own timeout.
    // Retained, so a device that boots later still sees the truth.
    client.connectionMessage = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean()
        .withWillTopic(_statusTopic)
        .withWillMessage('{"online":false}')
        .withWillQos(MqttQos.atLeastOnce)
        .withWillRetain();

    _client = client;
    connection.value = MqttConnectionState.connecting;
    try {
      await client.connect();
    } on Exception {
      client.disconnect(); // frees the socket; onDisconnected schedules retry
      return;
    }
    if (client.connectionStatus?.state != MqttConnectionState.connected) {
      client.disconnect(); // CONNACK refused; disconnect() also fires retry
      return;
    }
    _attempt = 0;
    connection.value = MqttConnectionState.connected;

    // Everything below is per-connection state: connect() builds a fresh
    // subscription manager, so both the broker-side subscription *and* the
    // previous \`updates\` stream are gone after every reconnect. Re-subscribe
    // and re-listen each time, forwarding into our own broadcast stream so
    // consumers never notice.
    //
    // QoS 0 for telemetry: a sample arrives every second and the next one
    // supersedes a lost one, so at-least-once bookkeeping buys nothing and
    // QoS 1's ack round-trips double the radio traffic on the device side.
    client.subscribe(_telemetryTopic, MqttQos.atMostOnce);
    _updatesSub = client.updates!.listen(_onUpdates);

    _publishJson(_statusTopic, {'online': true}, retain: true);
  }

  void _onUpdates(List<MqttReceivedMessage<MqttMessage>> batch) {
    for (final rec in batch) {
      final msg = rec.payload;
      if (msg is! MqttPublishMessage) continue;
      // Brownouts make ESP32s publish truncated frames mid-reboot; one bad
      // payload must never take down the whole stream. Count, don't crash.
      try {
        final map = jsonDecode(utf8.decode(msg.payload.message))
            as Map<String, dynamic>;
        _telemetry.add(Telemetry.fromJson(map));
      } catch (_) {
        droppedFrames++;
      }
    }
  }

  /// Commands ride QoS 1: "set relay 2 ON" must arrive across a flaky link.
  /// At-least-once delivery means possible duplicates, so firmware handlers
  /// must be idempotent -- set-to-state, never toggle.
  void sendCommand(String deviceId, Map<String, Object?> command) {
    if (connection.value != MqttConnectionState.connected) return;
    _publishJson('bench/$deviceId/cmd', command, qos: MqttQos.atLeastOnce);
  }

  void _publishJson(String topic, Map<String, Object?> body,
      {MqttQos qos = MqttQos.atLeastOnce, bool retain = false}) {
    final builder = MqttClientPayloadBuilder()..addString(jsonEncode(body));
    _client!.publishMessage(topic, qos, builder.payload!, retain: retain);
  }

  void _onDisconnected() {
    if (_closing) return;
    connection.value = MqttConnectionState.disconnected;
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    // The guard matters: a failed connect() can fire onDisconnected *and*
    // fall through our error path -- without it we'd double-schedule.
    if (_closing || (_retry?.isActive ?? false)) return;
    _updatesSub?.cancel();
    _updatesSub = null;
    // Full jitter (AWS style): uniform(0, min(cap, base * 2^attempt)). Pure
    // exponential backoff still synchronizes a fleet; the jitter is the point.
    final capMs = min(30000, 500 * (1 << min(_attempt, 6)));
    _attempt++;
    final delay = Duration(milliseconds: 250 + _rng.nextInt(capMs));
    _retry = Timer(delay, _connect);
  }

  void close() {
    _closing = true;
    _retry?.cancel();
    _updatesSub?.cancel();
    if (connection.value == MqttConnectionState.connected) {
      // Clean shutdown: overwrite the retained status ourselves, because a
      // clean DISCONNECT tells the broker to discard the Last Will.
      _publishJson(_statusTopic, {'online': false}, retain: true);
    }
    _client?.disconnect();
    _telemetry.close();
  }
}

void main() => runApp(const _Harness());

class _Harness extends StatefulWidget {
  const _Harness();
  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  // Public broker for bench demos. With no network the UI shows the backoff
  // loop doing its job -- that is the sample working, not failing.
  final _mqtt = MqttTelemetryClient(
      host: 'test.mosquitto.org',
      clientId: 'bench-app-\${DateTime.now().millisecondsSinceEpoch}');
  Telemetry? _last;
  StreamSubscription<Telemetry>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _mqtt.telemetry.listen((t) => setState(() => _last = t));
    _mqtt.start();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _mqtt.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('MQTT Telemetry')),
        body: Center(
          child: ValueListenableBuilder<MqttConnectionState>(
            valueListenable: _mqtt.connection,
            builder: (context, conn, _) => Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('broker: $conn'),
                const SizedBox(height: 8),
                Text(_last == null
                    ? 'no telemetry yet'
                    : '\${_last!.deviceId}: \${_last!.tempC.toStringAsFixed(1)} '
                        'degC, heap \${_last!.heapFree}'),
                Text('dropped frames: \${_mqtt.droppedFrames}'),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: conn == MqttConnectionState.connected
                      ? () => _mqtt
                          .sendCommand('esp32-01', {'relay': 2, 'state': true})
                      : null,
                  child: const Text('Relay 2 ON'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
`,
    notes:
      "The one that bites everyone: MqttClient.connect() rebuilds the internal subscription manager, so after EVERY reconnect both the broker-side subscriptions and your Dart-side `updates` listener are gone -- re-subscribe and re-listen per connection (this sample forwards into its own broadcast controller so UI listeners never notice), and note `updates` is null until connected. MqttConnectMessage.keepAliveFor() is deprecated in 10.x -- set client.keepAlivePeriod instead (the broker declares you dead at 1.5x keepalive). A clean disconnect() tells the broker to DISCARD the Last Will, so publish your retained offline-status message yourself before disconnecting cleanly. QoS rationale: telemetry rides QoS 0 (the next 1 Hz sample supersedes a lost one; at-least-once bookkeeping doubles device radio traffic for nothing), commands ride QoS 1 -- which means possible duplicates, so firmware handlers must be idempotent (set-to-state, never toggle). The manual backoff uses full jitter (uniform(0, cap)) because a fleet reconnecting on a fixed schedule after a broker restart stampedes it in lockstep -- mqtt_client's autoReconnect has no jitter. The harness points at test.mosquitto.org: public, unauthenticated, port 1883 cleartext -- fine for bench demos, never for production topics. With no network the UI shows the backoff loop doing its job; that is the sample working. Verified with flutter analyze on Flutter 3.44.4 / mqtt_client 10.11.11: zero issues.",
  },
  {
    id: "softap-provisioning-wizard",
    title: "ESP32 SoftAP Provisioning Wizard: Sealed-Step State Machine over a Device HTTP API",
    category: "connectivity",
    difficulty: "advanced",
    description:
      "A multi-step WiFi provisioning wizard for an ESP32 SoftAP: join-the-device-AP instructions, network scan fetched from the device's HTTP API at 192.168.4.1, credential submission, and join-status polling with per-poll error tolerance, an overall deadline, and explicit recovery paths (wrong password bounces back to the password form, not a dead end). The device API sits behind an interface with a fake implementation wired into main(), so the wizard runs standalone and is unit testable; the real client uses package:http with SoftAP-appropriate timeouts. Reach for it as the front door of any headless-device onboarding flow.",
    tags: ["provisioning", "softap", "wifi", "esp32", "http", "wizard", "sealed-class", "state-machine", "polling", "retry", "fake-injection", "onboarding", "192.168.4.1"],
    minFlutter: "3.22",
    packages: [{ name: "http", version: "^1.6.0" }],
    code: `// SoftAP WiFi provisioning wizard for an ESP32: the phone joins the device's
// temporary AP, drives its HTTP API at 192.168.4.1, and walks a sealed-state
// machine with explicit recovery paths. The device API sits behind an
// interface, so the wizard is testable and runs standalone on a fake.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class WifiNetwork {
  const WifiNetwork(this.ssid, this.rssi, {required this.secure});
  final String ssid; final int rssi; final bool secure;
}

enum JoinStatus { idle, joining, joined, wrongPassword, apNotFound }
abstract interface class ProvisioningApi {
  Future<List<WifiNetwork>> scanNetworks();
  Future<void> submitCredentials({required String ssid, required String password});
  Future<JoinStatus> fetchJoinStatus();
}

class SoftApHttpApi implements ProvisioningApi {
  SoftApHttpApi(this._client);
  final http.Client _client;
  // The SoftAP hands out 192.168.4.x with itself as .1 (ESP-IDF default).
  // One request at a time: esp_http_server has few sockets; parallel fetches
  // from an eager UI are how you get silent connection resets.
  static final _base = Uri.parse('http://192.168.4.1');

  @override
  Future<List<WifiNetwork>> scanNetworks() async {
    // Generous timeout: an STA+AP scan forces the ESP32 off-channel, so the
    // AP itself goes quiet for the 2-4 s the scan takes -- a short timeout
    // reads as "device dead" when it is just doing what we asked.
    final res = await _client.get(_base.replace(path: '/scan')).timeout(const Duration(seconds: 12));
    return [
      for (final e in (jsonDecode(res.body) as List<dynamic>).cast<Map<String, dynamic>>())
        WifiNetwork(e['ssid'] as String, e['rssi'] as int, secure: e['auth'] != 0),
    ];
  }

  @override
  Future<void> submitCredentials({required String ssid, required String password}) async {
    final res = await _client
        .post(_base.replace(path: '/connect'),
            body: jsonEncode({'ssid': ssid, 'password': password}),
            headers: {'content-type': 'application/json'})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) throw http.ClientException('device rejected credentials post');
  }

  @override
  Future<JoinStatus> fetchJoinStatus() async {
    final res = await _client.get(_base.replace(path: '/status')).timeout(const Duration(seconds: 5));
    final state = (jsonDecode(res.body) as Map<String, dynamic>)['state'];
    return JoinStatus.values.asNameMap()[state] ?? JoinStatus.idle;
  }
}

/// Fake with the timing texture of hardware: scan latency, polls spent
/// "joining", and rejection of passwords < 8 chars to demo recovery.
class FakeProvisioningApi implements ProvisioningApi {
  int _polls = 0;
  String _password = '';

  @override
  Future<List<WifiNetwork>> scanNetworks() async {
    await Future<void>.delayed(const Duration(seconds: 2));
    return const [
      WifiNetwork('ShopFloor', -48, secure: true),
      WifiNetwork('Bench-IoT', -61, secure: true),
      WifiNetwork('Guest', -77, secure: false)];
  }

  @override
  Future<void> submitCredentials({required String ssid, required String password}) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _password = password;
    _polls = 0; // fresh join cycle per credentials post, like the firmware
  }

  @override
  Future<JoinStatus> fetchJoinStatus() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (++_polls < 3) return JoinStatus.joining;
    return _password.length >= 8 ? JoinStatus.joined : JoinStatus.wrongPassword;
  }
}

sealed class WizardStep { const WizardStep(); }
class StepInstructions extends WizardStep { const StepInstructions(); }
class StepScanning extends WizardStep { const StepScanning(); }
class StepPickNetwork extends WizardStep {
  const StepPickNetwork(this.networks); final List<WifiNetwork> networks;
}
class StepFailure extends WizardStep {
  const StepFailure(this.reason); final String reason;
}
class StepCredentials extends WizardStep {
  const StepCredentials(this.network, {this.rejected = false});
  final WifiNetwork network;
  final bool rejected; // true when bounced back here after wrongPassword
}
class StepSubmitting extends WizardStep { const StepSubmitting(); }
class StepPolling extends WizardStep {
  const StepPolling(this.attempt, this.maxAttempts); final int attempt; final int maxAttempts;
}
class StepSuccess extends WizardStep { const StepSuccess(); }

class ProvisioningWizard {
  ProvisioningWizard(this._api);
  final ProvisioningApi _api;
  final step = ValueNotifier<WizardStep>(const StepInstructions());
  static const _maxPolls = 15; // 15 x 2 s covers slow DHCP on congested APs

  Future<void> beginScan() async {
    step.value = const StepScanning();
    try {
      // Copy before sorting (the API may return an unmodifiable list);
      // strongest first -- RSSI is the only disambiguator between twin SSIDs.
      final networks = [...await _api.scanNetworks()]..sort((a, b) => b.rssi.compareTo(a.rssi));
      step.value = StepPickNetwork(networks);
    } catch (e) {
      // Most common real cause: the phone silently hopped back to its home
      // WiFi (or routed via cellular) because the SoftAP has no internet.
      step.value = StepFailure('scan failed: $e -- is the phone still on the device AP?');
    }
  }

  void choose(WifiNetwork network) => step.value = StepCredentials(network);

  Future<void> submit(WifiNetwork network, String password) async {
    step.value = const StepSubmitting();
    try {
      await _api.submitCredentials(ssid: network.ssid, password: password);
    } catch (e) {
      step.value = StepFailure('could not deliver credentials: $e'); return;
    }
    // Poll rather than hold one long request open: WPA2 association + DHCP
    // takes 2-10 s, and a long-poll ties up one of the few httpd sockets.
    var consecutiveErrors = 0;
    for (var attempt = 1; attempt <= _maxPolls; attempt++) {
      step.value = StepPolling(attempt, _maxPolls);
      await Future<void>.delayed(const Duration(seconds: 2));
      final JoinStatus status;
      try {
        status = await _api.fetchJoinStatus();
        consecutiveErrors = 0;
      } catch (_) {
        // Transient poll errors are *expected* mid-join: STA+AP shares one
        // radio, so the AP hiccups while the STA half associates. Only give
        // up on a run of failures, which means the AP is really gone.
        if (++consecutiveErrors >= 4) {
          step.value = const StepFailure('device AP stopped answering -- it may have joined and torn down its AP; check the target network'); return;
        }
        continue;
      }
      switch (status) {
        case JoinStatus.joined:
          step.value = const StepSuccess(); return;
        case JoinStatus.wrongPassword:
          // Recoverable: bounce straight back to the password form instead
          // of a dead-end failure screen.
          step.value = StepCredentials(network, rejected: true); return;
        case JoinStatus.apNotFound:
          step.value = const StepFailure('target network not found by device'); return;
        case JoinStatus.idle || JoinStatus.joining:
          continue; // keep polling
      }
    }
    step.value = const StepFailure('timed out waiting for the device to join');
  }

  void restart() => step.value = const StepInstructions();
}

void main() => runApp(_Harness(ProvisioningWizard(FakeProvisioningApi())));

class _Harness extends StatelessWidget {
  const _Harness(this.wizard); final ProvisioningWizard wizard;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Device Provisioning')),
        body: ValueListenableBuilder<WizardStep>(
          valueListenable: wizard.step,
          builder: (context, step, _) => Padding(
            padding: const EdgeInsets.all(16),
            child: switch (step) {
              StepInstructions() => _centered([
                  const Text('1. Open WiFi settings on this phone\\n2. Join the network "PROV_XXXX"\\n3. Return here and continue'),
                  FilledButton(onPressed: wizard.beginScan, child: const Text('Continue')),
                ]),
              StepScanning() => const Center(child: CircularProgressIndicator()),
              StepPickNetwork(:final networks) => ListView(children: [
                  for (final n in networks)
                    ListTile(
                      title: Text(n.ssid), subtitle: Text('\${n.rssi} dBm'),
                      trailing: n.secure ? const Icon(Icons.lock) : null,
                      onTap: () => wizard.choose(n)),
                ]),
              StepCredentials() => _PasswordForm(wizard, step),
              StepSubmitting() => const Center(child: Text('Sending credentials...')),
              StepPolling(:final attempt, :final maxAttempts) => Center(child: Text('Waiting for join ($attempt/$maxAttempts)')),
              StepSuccess() => const Center(child: Text('Device is on your network.')),
              StepFailure(:final reason) => _centered([
                  Text(reason, textAlign: TextAlign.center),
                  TextButton(onPressed: wizard.restart, child: const Text('Start over')),
                ]),
            },
          ),
        ),
      ),
    );
  }

  Widget _centered(List<Widget> children) => Center(
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: children));
}

class _PasswordForm extends StatefulWidget {
  const _PasswordForm(this.wizard, this.step);
  final ProvisioningWizard wizard; final StepCredentials step;
  @override
  State<_PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<_PasswordForm> {
  final _password = TextEditingController();

  @override
  void dispose() { _password.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(widget.step.rejected
              ? 'Password rejected -- try again for "\${widget.step.network.ssid}"'
              : 'Password for "\${widget.step.network.ssid}"'),
          TextField(controller: _password, obscureText: true),
          const SizedBox(height: 16),
          FilledButton(
              onPressed: () => widget.wizard.submit(widget.step.network, _password.text),
              child: const Text('Provision')),
        ],
      );
}
`,
    notes:
      "Transport gotchas dominate this flow. Cleartext HTTP to 192.168.4.1 is blocked by default on modern OSes: Android 9+ needs usesCleartextTraffic or (better) a network-security-config scoped to 192.168.4.1; iOS needs NSAllowsLocalNetworking under ATS plus the iOS 14+ local-network privacy prompt. Worse, phones route around the SoftAP: because the device AP has no internet, Android and iOS will silently prefer cellular for 'internet' traffic -- the request times out even though the phone shows the AP joined. Production apps bind the socket to the WiFi network (Android ConnectivityManager.bindProcessToNetwork via a plugin) or tell the user to toggle mobile data off; this wizard at least maps the timeout to a 'still on the device AP?' hint. Protocol texture is deliberate: the /scan timeout is generous because an ESP32 STA+AP scan goes off-channel and mutes its own AP for 2-4 s, join-status polling tolerates a run of 3 transport errors before failing (the AP hiccups while the STA half associates -- one failed poll means nothing), and requests are strictly sequential because esp_http_server on a SoftAP has only a handful of sockets. Contract assumption: the device keeps its AP up until /status reports joined -- if your firmware tears the AP down immediately on join, success is indistinguishable from AP loss; fix that firmware-side (delayed teardown or an mDNS announce). Subtle Dart bug found in verification: the wizard copies the scan list before sorting, because an API returning a const/unmodifiable list makes in-place sort() throw UnsupportedError. Wizard logic is exercised by unit tests (happy path and wrong-password recovery) and flutter analyze reports zero issues on Flutter 3.44.4.",
  },
  {
    id: "usb-serial-monitor",
    title: "USB Serial Monitor: Line Framing, Ring-Buffer Console, and Graceful Unplug",
    category: "connectivity",
    difficulty: "advanced",
    description:
      "A bench serial console on flutter_libserialport: port enumeration, open at 115200 8N1 with flow control explicitly OFF, an incoming byte stream fed through a chunk-safe line framer (partial lines and CR-LF split across USB packets), a fixed-capacity ring-buffer console with a reversed ListView, a TX field that sends CR-LF, and unplug handling that tears down cleanly instead of crashing. A simulated device behind the same SerialLink seam emits deliberately split chunks, so the sample runs (and its framer is testable) with nothing plugged in. Reach for it whenever a Flutter tool needs eyes on a UART.",
    tags: ["serial", "uart", "usb", "flutter-libserialport", "libserialport", "console", "line-framing", "ring-buffer", "baud", "dtr-rts", "unplug", "bench-tool", "esp32", "rp2040", "ffi"],
    minFlutter: "3.10",
    packages: [{ name: "flutter_libserialport", version: "^0.6.0" }],
    code: `// USB-serial console for bench work against ESP32/RP2040/PIC18 boards:
// enumeration, 8N1 open with flow control OFF, a chunk-safe line framer, a
// ring-buffer console, and unplug handling that does not crash the app. The
// transport sits behind a seam so a simulated device keeps it runnable.
import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_libserialport/flutter_libserialport.dart';

abstract interface class SerialLink {
  String get name;
  Stream<Uint8List> get rx;
  void send(Uint8List bytes);
  void close();
}

class LibSerialPortLink implements SerialLink {
  LibSerialPortLink._(this._port, this._reader, this.name);

  static LibSerialPortLink open(String portName, {int baudRate = 115200}) {
    final port = SerialPort(portName);
    if (!port.openReadWrite()) {
      final err = SerialPort.lastError;
      port.dispose();
      throw StateError('open $portName failed: $err');
    }
    // Config is applied to the live fd, so it must happen *after* open --
    // set it on a closed port and libserialport silently keeps 9600 8N1.
    // The config struct is malloc'd in C: dispose it or leak it.
    final cfg = SerialPortConfig()
      ..baudRate = baudRate ..bits = 8 ..parity = SerialPortParity.none
      ..stopBits = 1 ..setFlowControl(SerialPortFlowControl.none);
    // Flow control OFF is not a skippable default on dev boards: DTR/RTS are
    // wired to EN/IO0 on most ESP32 boards (RUN/BOOTSEL circuits elsewhere),
    // so a driver wiggling handshake lines holds the chip in reset or drops
    // it into the ROM bootloader the moment the port opens.
    port.config = cfg;
    cfg.dispose();
    return LibSerialPortLink._(port, SerialPortReader(port), portName);
  }

  final SerialPort _port;
  final SerialPortReader _reader;
  @override final String name; // e.g. /dev/cu.usbserial-0001 or COM7
  @override Stream<Uint8List> get rx => _reader.stream;
  @override void send(Uint8List bytes) => _port.write(bytes, timeout: 500);

  @override
  void close() {
    // Reader first: closing the port while the reader isolate is mid-read
    // races the fd and can hard-crash on macOS instead of erroring politely.
    _reader.close();
    _port.close(); _port.dispose();
  }
}

/// Simulated device: periodic telemetry lines *deliberately delivered in
/// split chunks* to exercise the framer's partial-line path, plus a TX echo.
class FakeDeviceLink implements SerialLink {
  FakeDeviceLink() {
    _timer = Timer.periodic(const Duration(milliseconds: 800), (t) {
      final line = ascii.encode('TEMP=\${20 + t.tick % 5}.\${t.tick % 10} VBUS=5.02 tick=\${t.tick}\\r\\n');
      final cut = line.length ~/ 2;
      _ctrl.add(Uint8List.fromList(line.sublist(0, cut)));
      // Second half lands in a later event, exactly like a 64-byte USB URB
      // boundary slicing a line in two. Guard against close() racing the
      // delayed half -- adding to a closed controller throws.
      Timer(const Duration(milliseconds: 40), () {
        if (!_ctrl.isClosed) _ctrl.add(Uint8List.fromList(line.sublist(cut)));
      });
    });
  }

  final _ctrl = StreamController<Uint8List>.broadcast();
  Timer? _timer;
  @override String get name => 'simulated device';
  @override Stream<Uint8List> get rx => _ctrl.stream;
  @override void send(Uint8List bytes) =>
      _ctrl.add(Uint8List.fromList(ascii.encode('echo: ') + bytes));
  @override void close() { _timer?.cancel(); _ctrl.close(); }
}

/// Reassembles a byte stream into lines. USB CDC delivers arbitrary chunk
/// boundaries -- full-speed parts like the RP2040 move 64-byte URBs -- so
/// lines routinely arrive split, and a CR-LF pair can straddle two chunks.
/// Splitting on LF and trimming a trailing CR handles both without state.
class LineFramer {
  final List<int> _buf = <int>[];

  List<String> push(Uint8List chunk) {
    _buf.addAll(chunk);
    final lines = <String>[];
    var start = 0;
    for (var i = 0; i < _buf.length; i++) {
      if (_buf[i] != 0x0A) continue;
      var end = i;
      if (end > start && _buf[end - 1] == 0x0D) end--; // CR-LF or bare LF
      // allowMalformed: bootloader chatter at the wrong baud rate is not
      // UTF-8; a decode exception here must not kill the console stream.
      lines.add(utf8.decode(_buf.sublist(start, end), allowMalformed: true));
      start = i + 1;
    }
    if (start > 0) _buf.removeRange(0, start);
    return lines;
  }
}

/// Fixed-capacity console history. ListQueue gives O(1) evict-from-front; a
/// plain List with removeAt(0) is O(n) per line -- visible jank when a board
/// spews at full 115200 baud (~11 kB/s of log lines).
class ConsoleBuffer {
  ConsoleBuffer(this.capacity); final int capacity;
  final _lines = ListQueue<String>();

  void add(String line) {
    if (_lines.length == capacity) _lines.removeFirst();
    _lines.addLast(line);
  }
  List<String> snapshot() => List<String>.of(_lines);
}

void main() => runApp(const _Harness());

class _Harness extends StatefulWidget {
  const _Harness();
  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  static const _fakePort = '(simulated device)';

  final _framer = LineFramer();
  final _console = ConsoleBuffer(500);
  final _tx = TextEditingController();
  List<String> _ports = const [];
  String? _selected;
  SerialLink? _link;
  StreamSubscription<Uint8List>? _rxSub;
  String _status = 'closed';

  @override
  void initState() { super.initState(); _refreshPorts(); }

  // Enumeration walks sysfs/IOKit: cheap but not free -- on demand, no timer.
  void _refreshPorts() {
    setState(() {
      _ports = [...SerialPort.availablePorts, _fakePort];
      _selected = _ports.contains(_selected) ? _selected : _ports.last;
    });
  }

  void _open() {
    final name = _selected;
    if (name == null || _link != null) return;
    final SerialLink link;
    try {
      link = name == _fakePort ? FakeDeviceLink() : LibSerialPortLink.open(name);
    } on StateError catch (e) {
      setState(() => _status = e.message);
      return;
    }
    _rxSub = link.rx.listen(
      (chunk) => setState(() => _framer.push(chunk).forEach(_console.add)),
      // Yanking the cable surfaces here as a SerialPortError (or onDone on
      // some platforms) -- not as an exception at the call site. Tear down
      // and re-enumerate; the stale port name must not be reused.
      onError: (Object e) => _closeLink('unplugged: $e'),
      onDone: () => _closeLink('port closed by OS'),
    );
    setState(() { _link = link; _status = 'open: \${link.name} @ 115200 8N1'; });
  }

  void _closeLink(String status) {
    _rxSub?.cancel(); _rxSub = null;
    _link?.close(); _link = null;
    if (!mounted) return;
    setState(() => _status = status);
    _refreshPorts();
  }

  void _send() {
    final link = _link;
    if (link == null || _tx.text.isEmpty) return;
    // CR-LF, not bare LF: ESP-IDF's console REPL and most PIC bootloader
    // monitors treat CR as "execute"; a bare LF leaves them waiting forever.
    link.send(Uint8List.fromList(utf8.encode('\${_tx.text}\\r\\n')));
    _tx.clear();
  }

  @override
  void dispose() {
    _rxSub?.cancel(); _link?.close(); _tx.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lines = _console.snapshot();
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Serial Monitor')),
        body: Column(children: [
          Row(children: [
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButton<String>(
                isExpanded: true,
                value: _selected,
                items: [for (final p in _ports) DropdownMenuItem(value: p, child: Text(p))],
                onChanged: _link == null ? (v) => setState(() => _selected = v) : null,
              ),
            ),
            IconButton(onPressed: _refreshPorts, icon: const Icon(Icons.refresh)),
            FilledButton(
                onPressed: _link == null ? _open : () => _closeLink('closed'),
                child: Text(_link == null ? 'Open' : 'Close')),
            const SizedBox(width: 8),
          ]),
          Text(_status, style: Theme.of(context).textTheme.bodySmall),
          Expanded(
            // reverse:true pins the view to the newest line without scroll
            // bookkeeping; index math flips the buffer back around.
            child: ListView.builder(
              reverse: true,
              itemCount: lines.length,
              itemBuilder: (context, i) => Text(lines[lines.length - 1 - i],
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
            ),
          ),
          SafeArea(
            child: Row(children: [
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _tx,
                  decoration: const InputDecoration(hintText: 'command...'),
                  onSubmitted: (_) => _send()),
              ),
              IconButton(onPressed: _send, icon: const Icon(Icons.send)),
            ]),
          ),
        ]),
      ),
    );
  }
}
`,
    notes:
      "Package choice: flutter_libserialport (FFI over libserialport; Windows/macOS/Linux/Android) over usb_serial, which is Android-only and has not shipped a release since mid-2024 -- a bench console wants desktop. Platform setup: on macOS the Flutter template's App Sandbox blocks serial devices, so relax the entitlements (or disable the sandbox for an internal tool); on Linux add yourself to dialout; Android needs USB-host/OTG. The libserialport traps: port config must be applied AFTER opening (it writes termios to the live fd -- configure a closed port and you silently stay at 9600 8N1), and SerialPortConfig is malloc'd in C, so dispose() it or leak. Flow control OFF is load-bearing on dev boards: DTR/RTS drive the EN/IO0 auto-reset circuit on ESP32 boards (and RUN/BOOTSEL analogues elsewhere), so a driver toggling handshake lines resets the target or drops it into the ROM bootloader the moment you open the port. Unplugging surfaces as a SerialPortError on the reader's stream (onError/onDone), not as an exception at a call site -- tear down reader-first (closing the port under a mid-read reader can hard-crash on macOS), then re-enumerate; never reuse the stale port name. The framer splits on LF and trims a trailing CR so CR-LF and bare-LF firmware both work even when the pair straddles two USB chunks -- unit tested, including malformed UTF-8 from wrong-baud bootloader chatter (decoded with allowMalformed so the console never dies). The console history is a ListQueue: O(1) eviction matters at full-rate 115200 baud spam. flutter analyze on Flutter 3.44.4 / flutter_libserialport 0.6.0: zero issues.",
  },
];
