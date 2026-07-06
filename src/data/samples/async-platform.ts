// Verified advanced samples: async (isolates, streams) and platform
// (channels, FFI) -- both categories live in this file. Every `code` field
// compiled clean under flutter analyze on Flutter 3.38.5 / Dart 3.10.4;
// pure-Dart samples were executed, and the FFI sample ran against a library
// compiled from the C source in its header comment.

import type { FlutterSample } from "./types.js";

export const asyncPlatformSamples: readonly FlutterSample[] = [
  {
    id: "long-lived-isolate-worker",
    title: "Long-Lived Worker Isolate with Request Correlation and Graceful Shutdown",
    category: "async",
    difficulty: "expert",
    description:
      "A persistent worker isolate behind a Future-based facade: SendPort handshake, correlation ids matching out-of-order responses to pending Completers, per-request error envelopes that resurface as typed exceptions on the caller side, an onError port that fails all in-flight work if anything escapes the worker's own try/catch, and a drain-then-exit shutdown with a kill timeout. Reach for it when the same expensive engine (parser, search index, crypto) is hit repeatedly -- Isolate.run pays the spawn cost on every call; this pays it once.",
    tags: ["isolate", "sendport", "receiveport", "worker", "concurrency", "correlation-id", "error-propagation", "graceful-shutdown", "long-lived-isolate"],
    minFlutter: "3.10",
    packages: [],
    code: `// A persistent worker isolate with a request/response protocol. Unlike
// Isolate.run, one spawn cost is amortized over many requests -- the right
// shape for a parser, search index, or crypto engine that is hit repeatedly.
import 'dart:async';
import 'dart:io';
import 'dart:isolate';

// --- Wire protocol -----------------------------------------------------------
// Everything crossing the boundary is deep-copied, so messages stay small and
// contain only sendable state (primitives, collections, records, SendPorts).

class _Request {
  const _Request(this.id, this.op, this.payload);
  final int id;
  final String op;
  final Object? payload;
}

class _Response {
  const _Response(this.id, {this.result, this.error, this.stackTrace});
  final int id;
  final Object? result;
  final String? error;
  final String? stackTrace;
}

class _Shutdown {
  const _Shutdown();
}

/// Error objects do not cross isolates -- only their string forms do. Wrap
/// them so callers still catch a typed exception carrying the remote trace.
class RemoteWorkerException implements Exception {
  const RemoteWorkerException(this.message, this.remoteStackTrace);
  final String message;
  final String? remoteStackTrace;

  @override
  String toString() => 'RemoteWorkerException: $message';
}

// --- Client side ------------------------------------------------------------------

class IsolateWorker {
  IsolateWorker._(
    this._isolate,
    this._commands,
    this._pending,
    this._responses,
    this._errors,
    this._exit,
  );

  final Isolate _isolate;
  final SendPort _commands;
  final Map<int, Completer<Object?>> _pending;
  final ReceivePort _responses;
  final ReceivePort _errors;
  final ReceivePort _exit;

  var _nextId = 0;
  var _closed = false;

  static Future<IsolateWorker> spawn() async {
    final responses = ReceivePort();
    final errors = ReceivePort();
    final exit = ReceivePort();
    final pending = <int, Completer<Object?>>{};
    final handshake = Completer<SendPort>();

    responses.listen((message) {
      switch (message) {
        // Handshake: the worker's first message is its command SendPort.
        case SendPort():
          handshake.complete(message);
        case _Response():
          // Correlation id, not arrival order: responses may interleave.
          final completer = pending.remove(message.id);
          if (completer == null) return; // late reply after shutdown
          if (message.error != null) {
            completer.completeError(
              RemoteWorkerException(message.error!, message.stackTrace),
            );
          } else {
            completer.complete(message.result);
          }
      }
    });

    // Fires only for errors that escape the worker's own try/catch: treat
    // them as fatal and fail every in-flight request.
    errors.listen((message) {
      final list = message as List<dynamic>;
      final error = RemoteWorkerException('\${list[0]}', '\${list[1]}');
      for (final completer in pending.values) {
        completer.completeError(error);
      }
      pending.clear();
    });

    final isolate = await Isolate.spawn(
      _workerMain,
      responses.sendPort,
      onError: errors.sendPort,
      onExit: exit.sendPort,
    );
    final commands = await handshake.future;
    return IsolateWorker._(isolate, commands, pending, responses, errors, exit);
  }

  Future<T> request<T>(String op, [Object? payload]) {
    if (_closed) throw StateError('worker is shut down');
    final id = _nextId++;
    final completer = Completer<Object?>();
    _pending[id] = completer;
    _commands.send(_Request(id, op, payload));
    return completer.future.then((value) => value as T);
  }

  /// Graceful shutdown: stop accepting work, let the worker drain its queue,
  /// then wait for the onExit notification before releasing ports. Open
  /// ReceivePorts keep BOTH isolates alive -- forget these close() calls and
  /// the process never exits.
  Future<void> shutdown() async {
    if (_closed) return;
    _closed = true;
    _commands.send(const _Shutdown());
    await _exit.first.timeout(const Duration(seconds: 2), onTimeout: () {
      _isolate.kill(priority: Isolate.immediate); // drain took too long
      return null;
    });
    _responses.close();
    _errors.close();
    _exit.close();
  }
}

// --- Worker side --------------------------------------------------------------------

void _workerMain(SendPort responses) {
  final commands = ReceivePort();
  responses.send(commands.sendPort); // completes the handshake

  commands.listen((message) {
    if (message is _Shutdown) {
      // Closing the port lets the isolate unwind naturally once queued
      // events drain -- no Isolate.kill, no dropped in-flight work.
      commands.close();
      return;
    }
    final request = message as _Request;
    try {
      final result = _dispatch(request.op, request.payload);
      responses.send(_Response(request.id, result: result));
    } catch (e, s) {
      // Report per-request failures as data. An uncaught throw here would
      // surface on the onError port instead and poison every pending call.
      responses.send(_Response(request.id, error: '$e', stackTrace: '$s'));
    }
  });
}

Object? _dispatch(String op, Object? payload) => switch (op) {
      'fib' => _fib(payload as int),
      'sum' => (payload as List<dynamic>).cast<num>().reduce((a, b) => a + b),
      _ => throw ArgumentError('unknown op: $op'),
    };

int _fib(int n) => n < 2 ? n : _fib(n - 1) + _fib(n - 2);

// --- Demo ------------------------------------------------------------------------------

Future<void> main() async {
  final worker = await IsolateWorker.spawn();

  // Fire concurrently; correlation ids match replies even out of order.
  final results = await Future.wait([
    worker.request<int>('fib', 30),
    worker.request<num>('sum', [1, 2, 3.5]),
    worker.request<int>('fib', 10),
  ]);
  stdout.writeln('fib(30)=\${results[0]} sum=\${results[1]} fib(10)=\${results[2]}');

  try {
    await worker.request<void>('nope');
  } on RemoteWorkerException catch (e) {
    stdout.writeln('remote failure surfaced locally: $e');
  }

  await worker.shutdown();
  stdout.writeln('worker exited cleanly');
}`,
    notes:
      "Every message crossing the boundary is deep-copied, so the protocol classes carry only primitives, collections, and SendPorts -- error objects and stack traces cross as strings, hence RemoteWorkerException. The handshake reliably resolves before any response arrives because ports deliver each message in its own event-loop turn. Open ReceivePorts keep BOTH isolates alive: shutdown() must close the responses/errors/exit ports or the process never terminates -- the most common cause of a Dart CLI that hangs after main() returns. Graceful shutdown closes the worker's command port and lets queued work drain instead of Isolate.kill; the timeout path kills only as a last resort. Spawned isolates do not exist on the web target.",
  },
  {
    id: "isolate-run-json-parsing",
    title: "Isolate.run for Large JSON Decode + Model Mapping off the UI Thread",
    category: "async",
    difficulty: "advanced",
    description:
      "Offloads a multi-megabyte JSON decode with Isolate.run, keeping BOTH the decode and the fromJson mapping inside the worker closure so the expensive intermediate map-walk never touches the main isolate. Times an on-thread baseline against the isolate path to show what the trade actually buys. Reach for it when a payload takes longer than about a frame (10ms+) to parse; below that, spawn and copy overhead make it a net loss and staying on-thread is both faster and simpler.",
    tags: ["isolate", "isolate-run", "compute", "json", "jsondecode", "parsing", "jank", "ui-thread", "transferabletypeddata", "performance"],
    minFlutter: "3.7",
    packages: [],
    code: `// Moving a large JSON decode + model mapping off the main isolate with
// Isolate.run. In a Flutter app, decoding a few MB of JSON on the UI isolate
// blows straight through the 16ms frame budget; this is the standard fix.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

class Reading {
  const Reading({
    required this.sensorId,
    required this.celsius,
    required this.at,
  });

  factory Reading.fromJson(Map<String, dynamic> json) => Reading(
        sensorId: json['sensorId'] as int,
        // Servers emit 21 as int and 21.5 as double; casting straight to
        // double is the classic parse crash. Go through num.
        celsius: (json['celsius'] as num).toDouble(),
        at: DateTime.fromMillisecondsSinceEpoch(json['at'] as int),
      );

  final int sensorId;
  final double celsius;
  final DateTime at;
}

/// Decode AND map inside the worker. Returning the raw jsonDecode result and
/// mapping on the main isolate would move the expensive part (walking the
/// intermediate maps) back onto the UI thread.
List<Reading> parseReadings(String raw) {
  final decoded = jsonDecode(raw) as List<dynamic>;
  return [
    for (final item in decoded) Reading.fromJson(item as Map<String, dynamic>),
  ];
}

Future<List<Reading>> parseReadingsOffThread(String raw) {
  // The closure must capture only sendable state -- here, one String.
  // Capturing \`this\` from a State object (or anything holding a
  // BuildContext) fails at runtime with "Illegal argument in isolate
  // message", often far from the code that introduced the capture.
  return Isolate.run(() => parseReadings(raw));
}

String _syntheticPayload(int count) {
  final items = [
    for (var i = 0; i < count; i++)
      {
        'sensorId': i % 16,
        'celsius': 20 + (i % 100) / 10,
        'at': 1700000000000 + i,
      },
  ];
  return jsonEncode(items);
}

Future<void> main() async {
  final raw = _syntheticPayload(200000);
  final mb = (raw.length / (1024 * 1024)).toStringAsFixed(1);
  stdout.writeln('payload: \${mb}MB of JSON');

  // Baseline: everything on the current isolate. In Flutter this is where
  // frames drop -- nothing else runs until the decode finishes.
  final sw = Stopwatch()..start();
  final onThread = parseReadings(raw);
  final onThreadMs = sw.elapsedMilliseconds;

  sw
    ..reset()
    ..start();
  final offThread = await parseReadingsOffThread(raw);
  final offThreadMs = sw.elapsedMilliseconds;

  stdout.writeln('on-isolate:  \${onThread.length} readings '
      'in \${onThreadMs}ms (event loop blocked throughout)');
  stdout.writeln('Isolate.run: \${offThread.length} readings '
      'in \${offThreadMs}ms (event loop stayed free)');

  // Isolate.run is usually a little slower end-to-end: the input string is
  // copied into the child isolate at spawn. The result comes back cheaply --
  // Isolate.run exits with Isolate.exit, which transfers the final object
  // graph instead of copying it. So the win is not latency; it is that the
  // main isolate keeps pumping frames for the whole duration. For payloads
  // that parse in under a few milliseconds, the spawn + input copy overhead
  // dominates and staying on-thread is faster AND simpler.
}`,
    notes:
      "Isolate.run returns its result via Isolate.exit, so the final object graph transfers back nearly free -- the real cost is copying the INPUT string into the child isolate at spawn. For big binary payloads, TransferableTypedData moves bytes between isolates without copying; there is no string equivalent, so consider shipping utf8 bytes and decoding inside the worker. The closure must capture only sendable state: capturing a State object or anything holding a BuildContext fails at runtime with 'Illegal argument in isolate message', often far from the offending capture. compute() from flutter/foundation is now a thin wrapper over Isolate.run. On web there are no isolates -- both APIs run the callback on the main thread, so never rely on them for responsiveness there. Cast JSON numbers through num, not double: servers emit 21 and 21.5 with different types.",
  },
  {
    id: "advanced-stream-composition",
    title: "Debounce, switchMap, and pairwise from Raw Stream Primitives (No rxdart)",
    category: "async",
    difficulty: "expert",
    description:
      "Three rxdart staples rebuilt on StreamController and StreamSubscription: a debounce that flushes the trailing value on done, a switchMap that cancels the previous inner subscription before starting the next (killing the stale-response race), and an async* pairwise for consecutive-event deltas. Each operator forwards pause/resume/cancel correctly. Reach for it to drop an rxdart dependency you only use a few operators from, or to understand why a hand-rolled operator leaks subscriptions or drops final events.",
    tags: ["streams", "streamcontroller", "streamtransformer", "debounce", "switchmap", "pairwise", "cancellation", "backpressure", "broadcast-stream", "rxdart-free"],
    minFlutter: "3.10",
    packages: [],
    code: `// Debounce, switchMap, and pairwise built from StreamController primitives --
// no rxdart. Worth owning when these three are all you need from a reactive
// library, and worth reading to understand what rxdart does under the hood.
import 'dart:async';
import 'dart:io';

extension StreamComposition<T> on Stream<T> {
  /// Emits an event only after [duration] of silence. The trailing value is
  /// flushed on done -- dropping the final keystroke is the classic bug in
  /// hand-rolled debounce.
  ///
  /// The result is single-subscription even when the source is broadcast;
  /// call asBroadcastStream() on the result if multiple listeners need it.
  Stream<T> debounce(Duration duration) {
    StreamSubscription<T>? sub;
    Timer? timer;
    T? last;
    var hasLast = false;
    late final StreamController<T> controller;

    void flush() {
      if (hasLast) {
        hasLast = false;
        controller.add(last as T);
      }
    }

    controller = StreamController<T>(
      // Subscribe lazily in onListen, never eagerly in the enclosing
      // function: an eager subscription leaks if nobody ever listens.
      onListen: () {
        sub = listen(
          (event) {
            timer?.cancel();
            last = event;
            hasLast = true;
            timer = Timer(duration, flush);
          },
          onError: controller.addError,
          onDone: () {
            timer?.cancel();
            flush();
            controller.close();
          },
        );
      },
      // Forward backpressure; without these, pausing the result stream
      // keeps the source pumping into a growing buffer.
      onPause: () => sub?.pause(),
      onResume: () => sub?.resume(),
      onCancel: () {
        timer?.cancel();
        return sub?.cancel();
      },
    );
    return controller.stream;
  }

  /// Maps each event to an inner stream and forwards only the most recent
  /// one. The previous inner subscription is cancelled BEFORE the new one
  /// starts -- otherwise a slow old response interleaves with the new one,
  /// which is exactly the race this operator exists to prevent.
  Stream<R> switchMap<R>(Stream<R> Function(T value) project) {
    StreamSubscription<T>? outer;
    StreamSubscription<R>? inner;
    var outerDone = false;
    late final StreamController<R> controller;

    controller = StreamController<R>(
      onListen: () {
        outer = listen(
          (value) {
            unawaited(inner?.cancel());
            inner = project(value).listen(
              controller.add,
              onError: controller.addError,
              onDone: () {
                inner = null;
                // Close only when BOTH outer and inner are finished, or the
                // result stream ends while a projection is still emitting.
                if (outerDone) controller.close();
              },
            );
          },
          onError: controller.addError,
          onDone: () {
            outerDone = true;
            if (inner == null) controller.close();
          },
        );
      },
      onPause: () {
        outer?.pause();
        inner?.pause();
      },
      onResume: () {
        outer?.resume();
        inner?.resume();
      },
      onCancel: () async {
        await inner?.cancel();
        await outer?.cancel();
      },
    );
    return controller.stream;
  }

  /// Emits (previous, current) records. Written as async* for contrast:
  /// generators get pause, resume, and cancel propagation for free, at the
  /// cost of always being single-subscription.
  Stream<(T, T)> pairwise() async* {
    var hasPrevious = false;
    T? previous;
    await for (final event in this) {
      if (hasPrevious) yield (previous as T, event);
      previous = event;
      hasPrevious = true;
    }
  }
}

Future<void> main() async {
  // Debounce: bursts collapse to their final value, quiet gaps let one out.
  final keystrokes = StreamController<String>();
  final debounced =
      keystrokes.stream.debounce(const Duration(milliseconds: 50)).toList();

  for (final chunk in ['f', 'fl', 'flu', 'flut']) {
    keystrokes.add(chunk);
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  await Future<void>.delayed(const Duration(milliseconds: 80)); // quiet gap
  keystrokes.add('flutter');
  await keystrokes.close();
  stdout.writeln('debounced: \${await debounced}'); // [flut, flutter]

  // switchMap: the slow response for "a" is cancelled by "ab" arriving.
  Stream<String> fakeSearch(String query) async* {
    final latency = Duration(milliseconds: query.length == 1 ? 100 : 20);
    await Future<void>.delayed(latency);
    yield 'results for "$query"';
  }

  final results =
      await Stream.fromIterable(['a', 'ab']).switchMap(fakeSearch).toList();
  stdout.writeln('switchMap: $results'); // only "ab" -- "a" was cancelled

  // pairwise: deltas between consecutive samples.
  final deltas = await Stream.fromIterable([1, 4, 9, 16])
      .pairwise()
      .map((pair) => pair.$2 - pair.$1)
      .toList();
  stdout.writeln('pairwise deltas: $deltas'); // [3, 5, 7]
}`,
    notes:
      "Subscribe to the source lazily in onListen, never eagerly in the operator body -- an eager subscription leaks when nobody ever listens. Forward onPause/onResume, or pausing the result stream silently keeps the source pumping into an unbounded buffer. These controllers are single-subscription even when the source is broadcast; call asBroadcastStream() on the result if multiple listeners need it (and accept that pause no longer means backpressure). In switchMap, cancel the old inner subscription BEFORE subscribing to the new projection, and close the output only when outer AND inner are both done -- closing on outer-done alone truncates the final projection mid-emit. The async* form (pairwise) gets cancellation and backpressure propagation for free but is always single-subscription. And the classic hand-rolled debounce bug: dropping the trailing event when the source closes -- flush it in onDone.",
  },
  {
    id: "method-event-channel-roundtrip",
    title: "MethodChannel + EventChannel Round Trip with Kotlin/Swift Counterparts",
    category: "platform",
    difficulty: "advanced",
    description:
      "The Dart side of a native battery feed: a MethodChannel one-shot read that maps PlatformException into a domain error and falls back gracefully on MissingPluginException (tests, not-yet-implemented desktop targets), plus an EventChannel stream whose Dart subscription drives the native onListen/onCancel resource lifecycle. Complete Kotlin (BroadcastReceiver-based) and Swift counterpart snippets ship in the header comment. Reach for it when no plugin exists for the native capability you need and you own both sides of the app.",
    tags: ["platform-channels", "methodchannel", "eventchannel", "platformexception", "missingpluginexception", "kotlin", "swift", "codec", "native", "battery", "stream-lifecycle"],
    minFlutter: "3.7",
    packages: [],
    code: `// Dart side of a MethodChannel + EventChannel battery feed.
//
// -----------------------------------------------------------------------------
// Native counterparts (register these in the host app):
//
// Android -- MainActivity.kt:
//
//   class MainActivity : FlutterActivity() {
//     override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
//       super.configureFlutterEngine(flutterEngine)
//       val messenger = flutterEngine.dartExecutor.binaryMessenger
//
//       MethodChannel(messenger, "app.example/battery")
//         .setMethodCallHandler { call, result ->
//           when (call.method) {
//             "getBatteryLevel" -> {
//               val bm = getSystemService(BATTERY_SERVICE) as BatteryManager
//               val level =
//                 bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
//               if (level >= 0) result.success(level)
//               else result.error("UNAVAILABLE", "Battery level unknown", null)
//             }
//             else -> result.notImplemented()
//           }
//         }
//
//       EventChannel(messenger, "app.example/battery-stream").setStreamHandler(
//         object : EventChannel.StreamHandler {
//           private var receiver: BroadcastReceiver? = null
//           override fun onListen(args: Any?, events: EventChannel.EventSink) {
//             receiver = object : BroadcastReceiver() {
//               override fun onReceive(c: Context?, intent: Intent) {
//                 val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
//                 val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
//                 events.success(level * 100 / scale)
//               }
//             }
//             registerReceiver(
//               receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
//           }
//           override fun onCancel(args: Any?) {
//             unregisterReceiver(receiver)
//             receiver = null
//           }
//         })
//     }
//   }
//
// iOS -- AppDelegate.swift, in application(_:didFinishLaunchingWithOptions:):
//
//   let controller = window?.rootViewController as! FlutterViewController
//   let methods = FlutterMethodChannel(
//     name: "app.example/battery",
//     binaryMessenger: controller.binaryMessenger)
//   methods.setMethodCallHandler { call, result in
//     guard call.method == "getBatteryLevel" else {
//       result(FlutterMethodNotImplemented); return
//     }
//     UIDevice.current.isBatteryMonitoringEnabled = true
//     let level = UIDevice.current.batteryLevel
//     if level < 0 {
//       result(FlutterError(
//         code: "UNAVAILABLE", message: "Battery level unknown", details: nil))
//     } else {
//       result(Int(level * 100))
//     }
//   }
//   // EventChannel: FlutterEventChannel(name: "app.example/battery-stream", ...)
//   // with a FlutterStreamHandler that stores the FlutterEventSink in onListen
//   // and observes UIDevice.batteryLevelDidChangeNotification.
// -----------------------------------------------------------------------------
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Wraps both channels behind one API so widgets never see channel names.
class BatteryService {
  // Channel names are a cross-language contract checked only at runtime: a
  // typo on either side surfaces as MissingPluginException. Keep each name
  // in exactly one constant per language.
  //
  // Both channels default to StandardMethodCodec (binary, handles int,
  // double, String, Uint8List, List, Map). Use JSONMethodCodec only when the
  // native side already speaks JSON strings -- it is strictly slower.
  static const _methods = MethodChannel('app.example/battery');
  static const _events = EventChannel('app.example/battery-stream');

  /// One-shot read. Returns null where no native handler exists (unit tests,
  /// a desktop platform you have not implemented yet) instead of crashing.
  Future<int?> currentLevel() async {
    try {
      // The generic on invokeMethod is a promise, not a conversion: if
      // Kotlin answers with a Double or a Long outside int range, this
      // throws a TypeError at the await.
      return await _methods.invokeMethod<int>('getBatteryLevel');
    } on PlatformException catch (e) {
      // Structured failure from native result.error(code, message, details).
      throw BatteryReadException(e.code, e.message ?? 'unknown');
    } on MissingPluginException {
      return null;
    }
  }

  /// Live feed. Native onListen runs when the first Dart listener subscribes
  /// and onCancel when the last one cancels -- the Dart subscription drives
  /// the native resource lifecycle, so an uncancelled subscription leaks the
  /// native receiver, not just Dart memory.
  Stream<int> levelStream() {
    return _events.receiveBroadcastStream().map((dynamic level) => level as int)
        .handleError(
      (Object e) {
        final pe = e as PlatformException;
        throw BatteryReadException(pe.code, pe.message ?? 'stream error');
      },
      test: (e) => e is PlatformException,
    );
  }
}

class BatteryReadException implements Exception {
  const BatteryReadException(this.code, this.message);
  final String code;
  final String message;

  @override
  String toString() => 'BatteryReadException($code): $message';
}

class BatteryScreen extends StatefulWidget {
  const BatteryScreen({super.key});

  @override
  State<BatteryScreen> createState() => _BatteryScreenState();
}

class _BatteryScreenState extends State<BatteryScreen> {
  final _service = BatteryService();

  // Create the stream once. Calling levelStream() inside build would tear
  // down and re-create the native subscription on every rebuild.
  late final Stream<int> _levels = _service.levelStream();

  String _oneShot = 'not read yet';

  Future<void> _read() async {
    String text;
    try {
      final level = await _service.currentLevel();
      text = level == null ? 'no native handler on this platform' : '$level%';
    } on BatteryReadException catch (e) {
      text = e.toString();
    }
    if (!mounted) return;
    setState(() => _oneShot = text);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Platform channels')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('One-shot: $_oneShot'),
            const SizedBox(height: 8),
            FilledButton(onPressed: _read, child: const Text('Read battery')),
            const SizedBox(height: 24),
            // StreamBuilder subscribes on mount and cancels on unmount,
            // driving native onListen/onCancel for us.
            StreamBuilder<int>(
              stream: _levels,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Text('Feed error: \${snapshot.error}');
                }
                if (!snapshot.hasData) return const Text('Feed: waiting...');
                return Text('Feed: \${snapshot.data}%');
              },
            ),
          ],
        ),
      ),
    );
  }
}

void main() => runApp(const MaterialApp(home: BatteryScreen()));`,
    notes:
      "Channel names are a runtime-only contract: a typo on either side surfaces as MissingPluginException at the first call, so keep each name in exactly one constant per language. The generic on invokeMethod<int> is a promise, not a conversion -- Kotlin Int and Long both arrive as Dart int, but an accidental Double throws TypeError at the await. StandardMethodCodec (the default) handles int/double/String/Uint8List/List/Map; JSONMethodCodec exists for native sides that already speak JSON and is strictly slower. Create the EventChannel stream once and store it (late final field): calling receiveBroadcastStream() inside build() tears down and re-creates the native subscription on every rebuild, and every uncancelled subscription leaks the native receiver, not just Dart memory. Without a native handler the feed surfaces MissingPluginException through StreamBuilder's error state rather than crashing, which is what makes this file runnable anywhere.",
  },
  {
    id: "dart-ffi-native-binding",
    title: "dart:ffi Binding with package:ffi Allocation and Memory Ownership Rules",
    category: "platform",
    difficulty: "expert",
    description:
      "A complete dart:ffi binding over a three-function C library (FNV-1a hash, dot product, string builder): per-platform DynamicLibrary resolution, paired native/Dart typedefs checked by lookupFunction, calloc-backed buffers with try/finally ownership, Utf8 marshalling in both directions, and an exported free_cstring because memory allocated by C must be freed by C. The C source ships in the header comment and the binding was verified against the compiled library. Reach for it to call existing native code directly, without a platform channel round-trip or a plugin.",
    tags: ["ffi", "dart-ffi", "dynamiclibrary", "native", "c", "calloc", "malloc", "utf8", "pointer", "memory-management", "interop"],
    minFlutter: "3.29",
    packages: [
      { name: "ffi", version: "^2.2.0" },
    ],
    code: `// dart:ffi binding to a small native library, using package:ffi for memory
// management and UTF-8 marshalling.
//
// -----------------------------------------------------------------------------
// native/nativemath.c -- compile before running:
//   clang -dynamiclib -O2 -o libnativemath.dylib nativemath.c   (macOS)
//   clang -shared -fPIC -O2 -o libnativemath.so nativemath.c    (Linux)
//   cl /LD /O2 nativemath.c /Fe:nativemath.dll                  (Windows)
//
//   #include <stdint.h>
//   #include <stdio.h>
//   #include <stdlib.h>
//   #include <string.h>
//
//   uint64_t fnv1a_hash(const uint8_t *data, intptr_t length) {
//     uint64_t hash = 1469598103934665603ULL;
//     for (intptr_t i = 0; i < length; i++) {
//       hash ^= data[i];
//       hash *= 1099511628211ULL;
//     }
//     return hash;
//   }
//
//   double dot_product(const double *a, const double *b, intptr_t length) {
//     double sum = 0.0;
//     for (intptr_t i = 0; i < length; i++) sum += a[i] * b[i];
//     return sum;
//   }
//
//   /* Returns a malloc'd string. The CALLER must release it -- through
//      free_cstring below, never through Dart's allocator. */
//   char *greet(const char *name) {
//     const char *prefix = "hello, ";
//     size_t n = strlen(prefix) + strlen(name) + 1;
//     char *out = (char *)malloc(n);
//     snprintf(out, n, "%s%s", prefix, name);
//     return out;
//   }
//
//   void free_cstring(char *ptr) { free(ptr); }
// -----------------------------------------------------------------------------
import 'dart:ffi';
import 'dart:io';
import 'dart:typed_data';

import 'package:ffi/ffi.dart';

// Two typedefs per function: the C signature (native types) and the Dart view
// (int/double). lookupFunction checks them against each other at compile
// time -- but nothing checks them against the actual C declaration. Get one
// wrong and calls corrupt memory instead of throwing.
typedef _Fnv1aC = Uint64 Function(Pointer<Uint8> data, IntPtr length);
typedef _Fnv1aDart = int Function(Pointer<Uint8> data, int length);

typedef _DotC = Double Function(
    Pointer<Double> a, Pointer<Double> b, IntPtr length);
typedef _DotDart = double Function(
    Pointer<Double> a, Pointer<Double> b, int length);

typedef _GreetC = Pointer<Utf8> Function(Pointer<Utf8> name);
typedef _GreetDart = Pointer<Utf8> Function(Pointer<Utf8> name);

typedef _FreeC = Void Function(Pointer<Utf8> ptr);
typedef _FreeDart = void Function(Pointer<Utf8> ptr);

class NativeMath {
  NativeMath(DynamicLibrary lib)
      : _hash = lib.lookupFunction<_Fnv1aC, _Fnv1aDart>('fnv1a_hash'),
        _dot = lib.lookupFunction<_DotC, _DotDart>('dot_product'),
        _greet = lib.lookupFunction<_GreetC, _GreetDart>('greet'),
        _freeCString = lib.lookupFunction<_FreeC, _FreeDart>('free_cstring');

  /// Resolves the platform-specific library name. On iOS, native code is
  /// statically linked into the app binary, so symbols come from the process
  /// itself rather than a separate file.
  factory NativeMath.open() {
    if (Platform.isMacOS) {
      return NativeMath(DynamicLibrary.open('libnativemath.dylib'));
    }
    if (Platform.isWindows) {
      return NativeMath(DynamicLibrary.open('nativemath.dll'));
    }
    if (Platform.isIOS) return NativeMath(DynamicLibrary.process());
    // Linux and Android (bundled via jniLibs) share the .so convention.
    return NativeMath(DynamicLibrary.open('libnativemath.so'));
  }

  final _Fnv1aDart _hash;
  final _DotDart _dot;
  final _GreetDart _greet;
  final _FreeDart _freeCString;

  int hashBytes(Uint8List bytes) {
    // Dart heap objects can move under the GC, so native code must never
    // see them directly: copy into C memory for the duration of the call.
    final ptr = calloc<Uint8>(bytes.length);
    try {
      ptr.asTypedList(bytes.length).setAll(0, bytes);
      return _hash(ptr, bytes.length);
    } finally {
      // Every allocation has exactly one owner. This function allocated,
      // so this function frees -- even when _hash throws.
      calloc.free(ptr);
    }
  }

  double dot(List<double> a, List<double> b) {
    assert(a.length == b.length, 'vectors must match');
    final pa = calloc<Double>(a.length);
    final pb = calloc<Double>(b.length);
    try {
      pa.asTypedList(a.length).setAll(0, a);
      pb.asTypedList(b.length).setAll(0, b);
      return _dot(pa, pb, a.length);
    } finally {
      calloc
        ..free(pa)
        ..free(pb);
    }
  }

  String greet(String name) {
    // toNativeUtf8 allocates with package:ffi's malloc: Dart owns this one.
    final cName = name.toNativeUtf8();
    try {
      final cResult = _greet(cName);
      try {
        return cResult.toDartString();
      } finally {
        // C allocated the result, so C frees it. Crossing allocators --
        // Dart-side malloc.free on a pointer from MSVC's malloc -- is
        // undefined behavior and a real crash on Windows.
        _freeCString(cResult);
      }
    } finally {
      malloc.free(cName);
    }
  }
}

void main() {
  final NativeMath native;
  try {
    native = NativeMath.open();
  } on ArgumentError catch (e) {
    stdout.writeln('Native library not found: $e');
    stdout.writeln('Build it from the C source in the header comment first.');
    return;
  }

  final hash = native.hashBytes(Uint8List.fromList('flutter'.codeUnits));
  stdout.writeln('fnv1a("flutter") = 0x\${hash.toRadixString(16)}');
  stdout.writeln('dot([1,2,3],[4,5,6]) = \${native.dot([1, 2, 3], [4, 5, 6])}');
  stdout.writeln(native.greet('dart'));
}`,
    notes:
      "The two typedefs per function are checked against each other, but nothing checks them against the actual C declaration -- an IntPtr where C has int32_t silently corrupts memory instead of throwing. Dart GC can move heap objects, so native code never sees Dart lists directly: copy through calloc'd memory and free in finally so exceptions cannot leak. Never free a C-malloc'd pointer with Dart-side malloc.free: the allocators can differ (guaranteed crash territory with MSVC on Windows), hence the exported free_cstring. toNativeUtf8 allocates with package:ffi's malloc, and that one IS Dart's to free. Platform loading: DynamicLibrary.process() on iOS (static linking), libnativemath.so bundled under jniLibs on Android. The @Native annotation (Dart 3+) trims this boilerplate but needs asset or process symbol resolution configured. dart:ffi does not exist on the web target.",
  },
];
