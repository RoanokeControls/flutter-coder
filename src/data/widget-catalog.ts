// Curated Flutter widget catalog with categories, properties, and usage notes

export interface WidgetEntry {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly commonProps: readonly string[];
  readonly tips: string;
}

export const widgetCatalog: readonly WidgetEntry[] = [
  // ── Layout: Single Child ──────────────────────────────────────────────
  { name: "Container", category: "Layout: Single Child", description: "Combines common painting, positioning, and sizing widgets.", commonProps: ["child", "padding", "margin", "decoration", "width", "height", "alignment", "constraints", "color", "transform"], tips: "Use DecoratedBox + Padding + SizedBox instead for better performance. Container is a convenience wrapper." },
  { name: "Padding", category: "Layout: Single Child", description: "Insets its child by the given padding.", commonProps: ["padding", "child"], tips: "Prefer over Container when you only need padding. Use EdgeInsets.symmetric() or EdgeInsets.only() for partial padding." },
  { name: "Center", category: "Layout: Single Child", description: "Centers its child within itself.", commonProps: ["child", "widthFactor", "heightFactor"], tips: "Equivalent to Align(alignment: Alignment.center). Use widthFactor/heightFactor to shrink-wrap." },
  { name: "Align", category: "Layout: Single Child", description: "Aligns its child within itself.", commonProps: ["alignment", "child", "widthFactor", "heightFactor"], tips: "Use Alignment constants or FractionalOffset for precise positioning." },
  { name: "SizedBox", category: "Layout: Single Child", description: "A box with a specified size.", commonProps: ["width", "height", "child"], tips: "Use SizedBox.expand() to fill parent, SizedBox.shrink() for zero size, SizedBox(height: 16) as spacing." },
  { name: "ConstrainedBox", category: "Layout: Single Child", description: "Imposes additional constraints on its child.", commonProps: ["constraints", "child"], tips: "Use BoxConstraints.tightFor() for exact sizes, BoxConstraints.loose() for max-only constraints." },
  { name: "FractionallySizedBox", category: "Layout: Single Child", description: "Sizes its child to a fraction of the total available space.", commonProps: ["widthFactor", "heightFactor", "alignment", "child"], tips: "Great for responsive layouts. Factors are 0.0 to 1.0 (percentage of parent)." },
  { name: "AspectRatio", category: "Layout: Single Child", description: "Sizes child to a specific aspect ratio.", commonProps: ["aspectRatio", "child"], tips: "aspectRatio = width / height. E.g., 16/9 for widescreen, 1.0 for square." },
  { name: "FittedBox", category: "Layout: Single Child", description: "Scales and positions its child within itself according to fit.", commonProps: ["fit", "alignment", "child", "clipBehavior"], tips: "Use BoxFit.contain to scale down, BoxFit.cover to fill, BoxFit.scaleDown to only shrink." },
  { name: "IntrinsicHeight", category: "Layout: Single Child", description: "Sizes child to the child's intrinsic height.", commonProps: ["child"], tips: "Expensive! Use sparingly. Useful for Row children that need to match heights." },
  { name: "IntrinsicWidth", category: "Layout: Single Child", description: "Sizes child to the child's intrinsic width.", commonProps: ["child"], tips: "Expensive! Use sparingly. Useful for Column children that need to match widths." },

  // ── Layout: Multi Child ───────────────────────────────────────────────
  { name: "Row", category: "Layout: Multi Child", description: "Displays children in a horizontal array.", commonProps: ["children", "mainAxisAlignment", "crossAxisAlignment", "mainAxisSize", "textDirection"], tips: "Use MainAxisSize.min to shrink-wrap. Wrap text children in Flexible/Expanded to prevent overflow." },
  { name: "Column", category: "Layout: Multi Child", description: "Displays children in a vertical array.", commonProps: ["children", "mainAxisAlignment", "crossAxisAlignment", "mainAxisSize"], tips: "Use MainAxisSize.min to shrink-wrap. Common cause of overflow errors - wrap in SingleChildScrollView or use Expanded." },
  { name: "Stack", category: "Layout: Multi Child", description: "Overlays children on top of each other.", commonProps: ["children", "alignment", "fit", "clipBehavior"], tips: "First child is bottom layer. Use Positioned widgets for absolute positioning within Stack." },
  { name: "Wrap", category: "Layout: Multi Child", description: "Displays children in multiple runs (wrapping).", commonProps: ["children", "direction", "alignment", "spacing", "runSpacing", "runAlignment"], tips: "Use for tag chips, flow layouts. spacing = gap between items, runSpacing = gap between lines." },
  { name: "Flow", category: "Layout: Multi Child", description: "Sizes and positions children efficiently with a delegate.", commonProps: ["delegate", "children", "clipBehavior"], tips: "More efficient than Wrap for animations. Requires a FlowDelegate for custom positioning." },
  { name: "ListView", category: "Layout: Multi Child", description: "Scrollable list of widgets.", commonProps: ["children", "itemBuilder", "itemCount", "scrollDirection", "padding", "controller", "physics", "shrinkWrap", "separatorBuilder"], tips: "Use ListView.builder for large lists (lazy loading). Avoid shrinkWrap: true in scrollable parents. Use ListView.separated for dividers." },
  { name: "GridView", category: "Layout: Multi Child", description: "Scrollable 2D array of widgets.", commonProps: ["gridDelegate", "children", "itemBuilder", "itemCount", "scrollDirection", "padding", "shrinkWrap"], tips: "Use GridView.builder for large grids. SliverGridDelegateWithFixedCrossAxisCount for fixed columns, WithMaxCrossAxisExtent for responsive." },
  { name: "Table", category: "Layout: Multi Child", description: "Displays children in a table layout.", commonProps: ["children", "columnWidths", "defaultColumnWidth", "border", "defaultVerticalAlignment"], tips: "Use for tabular data with fixed columns. For scrollable tables, use DataTable or a custom Sliver." },

  // ── Layout: Sliver ────────────────────────────────────────────────────
  { name: "CustomScrollView", category: "Layout: Sliver", description: "Scroll view with custom scroll effects using slivers.", commonProps: ["slivers", "scrollDirection", "controller", "physics"], tips: "Combine SliverAppBar + SliverList + SliverGrid for complex scroll layouts. All children must be slivers." },
  { name: "SliverList", category: "Layout: Sliver", description: "Sliver that places multiple children in a linear array.", commonProps: ["delegate"], tips: "Use SliverChildBuilderDelegate for lazy building. Equivalent of ListView inside CustomScrollView." },
  { name: "SliverGrid", category: "Layout: Sliver", description: "Sliver that places multiple children in a 2D arrangement.", commonProps: ["delegate", "gridDelegate"], tips: "Use SliverChildBuilderDelegate for lazy building. Combine with SliverList in CustomScrollView." },
  { name: "SliverAppBar", category: "Layout: Sliver", description: "Material Design app bar that integrates with CustomScrollView.", commonProps: ["title", "expandedHeight", "flexibleSpace", "floating", "pinned", "snap", "actions"], tips: "floating: appears on scroll up. pinned: always visible. snap: animates fully in/out. Use FlexibleSpaceBar for parallax." },
  { name: "SliverToBoxAdapter", category: "Layout: Sliver", description: "Sliver that wraps a single box widget.", commonProps: ["child"], tips: "Use to insert non-sliver widgets into a CustomScrollView. Wrap headers, banners, etc." },
  { name: "SliverFillRemaining", category: "Layout: Sliver", description: "Sliver that fills remaining viewport space.", commonProps: ["child", "hasScrollBody"], tips: "Great for empty states or footer content that fills available space." },

  // ── Text & Styling ────────────────────────────────────────────────────
  { name: "Text", category: "Text & Styling", description: "Displays a string of text with single style.", commonProps: ["data", "style", "textAlign", "maxLines", "overflow", "softWrap", "textScaler"], tips: "Use Theme.of(context).textTheme for consistent styling. overflow: TextOverflow.ellipsis for truncation. textScaleFactor is deprecated — use textScaler: TextScaler.linear(x)." },
  { name: "RichText", category: "Text & Styling", description: "Displays text with multiple styles using TextSpan tree.", commonProps: ["text", "textAlign", "maxLines", "overflow"], tips: "Use Text.rich() shorthand. TextSpan children for mixed styles. WidgetSpan for inline widgets." },
  { name: "SelectableText", category: "Text & Styling", description: "Text that can be selected by the user.", commonProps: ["data", "style", "textAlign", "maxLines", "onTap"], tips: "Use for content users might want to copy. Supports onTap and selection controls." },
  { name: "DefaultTextStyle", category: "Text & Styling", description: "Sets the default text style for descendant Text widgets.", commonProps: ["style", "child", "textAlign", "maxLines", "overflow"], tips: "Useful for setting base text style that children inherit. Avoids repeating style on every Text widget." },
  { name: "Icon", category: "Text & Styling", description: "Displays a Material Design icon.", commonProps: ["icon", "size", "color", "semanticLabel"], tips: "Use Icons.* constants. For custom icons, use Image.asset or SvgPicture. Always provide semanticLabel for accessibility." },

  // ── Input ─────────────────────────────────────────────────────────────
  { name: "TextField", category: "Input", description: "Material Design text input field.", commonProps: ["controller", "decoration", "onChanged", "onSubmitted", "keyboardType", "obscureText", "maxLines", "focusNode", "autofocus", "inputFormatters"], tips: "Always dispose TextEditingController. Use InputDecoration for labels, hints, errors. Use TextInputFormatters for validation." },
  { name: "TextFormField", category: "Input", description: "TextField wrapped in FormField for form validation.", commonProps: ["controller", "decoration", "validator", "onSaved", "onChanged", "initialValue", "autovalidateMode"], tips: "Use within a Form widget. validator returns null for valid, error string for invalid. Use AutovalidateMode.onUserInteraction." },
  { name: "Form", category: "Input", description: "Groups FormField widgets for validation and saving.", commonProps: ["key", "child", "autovalidateMode", "onChanged"], tips: "Use GlobalKey<FormState> to access validate(), save(), reset(). Wrap TextFormField children." },
  { name: "Checkbox", category: "Input", description: "Material Design checkbox.", commonProps: ["value", "onChanged", "activeColor", "tristate"], tips: "Controlled widget - must update value in onChanged. Use CheckboxListTile for checkbox with label." },
  { name: "Radio", category: "Input", description: "Material Design radio button.", commonProps: ["value", "groupValue", "onChanged", "activeColor"], tips: "Controlled widget. groupValue determines selection. Use RadioListTile for radio with label." },
  { name: "Switch", category: "Input", description: "Material Design switch toggle.", commonProps: ["value", "onChanged", "activeColor", "activeTrackColor"], tips: "Controlled widget. Use SwitchListTile for switch with label. Use adaptive constructor for platform-native look." },
  { name: "Slider", category: "Input", description: "Material Design slider.", commonProps: ["value", "onChanged", "min", "max", "divisions", "label"], tips: "Use divisions for discrete values. label shows value tooltip. Use RangeSlider for min/max range selection." },
  { name: "DropdownButton", category: "Input", description: "Material Design dropdown selector.", commonProps: ["value", "items", "onChanged", "hint", "isExpanded"], tips: "Use DropdownButtonFormField for form integration. items is List<DropdownMenuItem>. isExpanded: true to fill width." },
  { name: "Autocomplete", category: "Input", description: "Provides autocomplete suggestions as user types.", commonProps: ["optionsBuilder", "onSelected", "fieldViewBuilder", "optionsViewBuilder", "displayStringForOption"], tips: "optionsBuilder is async - great for API-driven suggestions. Returns Iterable of matching options." },

  // ── Buttons ───────────────────────────────────────────────────────────
  { name: "ElevatedButton", category: "Buttons", description: "Material Design filled button with elevation.", commonProps: ["onPressed", "child", "style", "onLongPress"], tips: "Primary action buttons. Use ButtonStyle for customization. onPressed: null disables the button." },
  { name: "TextButton", category: "Buttons", description: "Material Design text button (no elevation).", commonProps: ["onPressed", "child", "style"], tips: "For less prominent actions. Use in dialogs, cards, inline text." },
  { name: "OutlinedButton", category: "Buttons", description: "Material Design outlined button.", commonProps: ["onPressed", "child", "style"], tips: "Medium emphasis. Use for secondary actions alongside ElevatedButton." },
  { name: "IconButton", category: "Buttons", description: "Material Design icon button.", commonProps: ["icon", "onPressed", "tooltip", "iconSize", "color", "splashRadius"], tips: "Always provide tooltip for accessibility. Use in AppBar actions, card actions." },
  { name: "FloatingActionButton", category: "Buttons", description: "Material Design FAB.", commonProps: ["onPressed", "child", "tooltip", "heroTag", "mini", "shape"], tips: "One per screen typically. Use heroTag when multiple FABs exist. Scaffold.floatingActionButton for positioning." },
  { name: "PopupMenuButton", category: "Buttons", description: "Displays a popup menu when pressed.", commonProps: ["itemBuilder", "onSelected", "icon", "initialValue", "tooltip"], tips: "itemBuilder returns List<PopupMenuEntry>. Use PopupMenuItem for items, PopupMenuDivider for separators." },

  // ── Navigation ────────────────────────────────────────────────────────
  { name: "Scaffold", category: "Navigation", description: "Material Design visual layout structure.", commonProps: ["appBar", "body", "floatingActionButton", "drawer", "bottomNavigationBar", "bottomSheet", "backgroundColor"], tips: "Foundation of most screens. Use resizeToAvoidBottomInset: false to prevent keyboard resize. SafeArea inside body." },
  { name: "AppBar", category: "Navigation", description: "Material Design app bar.", commonProps: ["title", "actions", "leading", "bottom", "elevation", "backgroundColor", "centerTitle", "flexibleSpace"], tips: "Use automaticallyImplyLeading: true for auto back button. bottom: for TabBar. PreferredSize for custom height." },
  { name: "BottomNavigationBar", category: "Navigation", description: "Material Design bottom nav bar.", commonProps: ["items", "currentIndex", "onTap", "type", "selectedItemColor", "unselectedItemColor"], tips: "Use NavigationBar (Material 3) for modern apps. 3-5 items recommended. type: BottomNavigationBarType.fixed for <=4 items." },
  { name: "NavigationBar", category: "Navigation", description: "Material 3 bottom navigation bar.", commonProps: ["destinations", "selectedIndex", "onDestinationSelected", "backgroundColor", "elevation"], tips: "Material 3 replacement for BottomNavigationBar. Use NavigationDestination for items." },
  { name: "NavigationRail", category: "Navigation", description: "Material Design side navigation rail.", commonProps: ["destinations", "selectedIndex", "onDestinationSelected", "leading", "trailing", "extended"], tips: "Use for tablet/desktop layouts. extended: true shows labels. Combine with BottomNavigationBar for responsive." },
  { name: "TabBar", category: "Navigation", description: "Material Design tab bar.", commonProps: ["tabs", "controller", "onTap", "isScrollable", "indicatorColor", "labelColor"], tips: "Use with TabBarView and TabController (or DefaultTabController). isScrollable: true for many tabs." },
  { name: "Drawer", category: "Navigation", description: "Material Design side drawer.", commonProps: ["child", "elevation", "backgroundColor", "width"], tips: "Access via Scaffold.drawer. Use DrawerHeader + ListTile children. Scaffold.of(context).openDrawer() to open programmatically." },
  { name: "BottomSheet", category: "Navigation", description: "Material Design bottom sheet.", commonProps: ["onClosing", "builder", "enableDrag", "elevation"], tips: "Use showModalBottomSheet() for modal. showBottomSheet() for persistent. DraggableScrollableSheet for expandable." },

  // ── Scrolling ─────────────────────────────────────────────────────────
  { name: "SingleChildScrollView", category: "Scrolling", description: "Scrollable box with a single child.", commonProps: ["child", "scrollDirection", "controller", "physics", "padding"], tips: "Use for short content that might overflow. For long lists, use ListView.builder instead. Avoid nesting scrollables." },
  { name: "PageView", category: "Scrolling", description: "Scrollable page-by-page list.", commonProps: ["children", "controller", "onPageChanged", "physics", "scrollDirection"], tips: "Use PageView.builder for large page counts. PageController for programmatic page changes. Great for onboarding." },
  { name: "NestedScrollView", category: "Scrolling", description: "Coordinates scrolling between a header and body.", commonProps: ["headerSliverBuilder", "body", "controller", "scrollDirection"], tips: "Use for SliverAppBar + TabBarView pattern. headerSliverBuilder returns List<Widget> (slivers)." },
  { name: "RefreshIndicator", category: "Scrolling", description: "Pull-to-refresh wrapper for scrollable content.", commonProps: ["child", "onRefresh", "color", "displacement"], tips: "onRefresh must return Future. Child must be a scrollable widget. Material Design pull-to-refresh pattern." },

  // ── Visual & Decoration ───────────────────────────────────────────────
  { name: "Card", category: "Visual & Decoration", description: "Material Design card with rounded corners and elevation.", commonProps: ["child", "elevation", "shape", "color", "margin", "clipBehavior"], tips: "Use for grouped content. Clip images with clipBehavior: Clip.antiAlias. InkWell inside for tap effect." },
  { name: "Divider", category: "Visual & Decoration", description: "Thin horizontal line.", commonProps: ["height", "thickness", "indent", "endIndent", "color"], tips: "height is total vertical space (not line thickness). Use VerticalDivider in Row." },
  { name: "ListTile", category: "Visual & Decoration", description: "Fixed-height row with icon, text, and optional action.", commonProps: ["title", "subtitle", "leading", "trailing", "onTap", "dense", "contentPadding", "selected"], tips: "Use for lists, settings, menus. dense: true for compact. CheckboxListTile, SwitchListTile, RadioListTile for controls." },
  { name: "CircleAvatar", category: "Visual & Decoration", description: "Circular widget typically used for user profile pictures.", commonProps: ["child", "backgroundImage", "backgroundColor", "radius", "foregroundColor"], tips: "Use for user avatars. backgroundImage for network images. Falls back to child (usually initials Text)." },
  { name: "Chip", category: "Visual & Decoration", description: "Material Design chip for tags, filters, actions.", commonProps: ["label", "avatar", "onDeleted", "backgroundColor", "deleteIcon"], tips: "Variants: ActionChip, FilterChip, ChoiceChip, InputChip. Use Wrap widget for chip groups." },
  { name: "Badge", category: "Visual & Decoration", description: "Material 3 badge for notification counts.", commonProps: ["label", "child", "backgroundColor", "textColor", "isLabelVisible"], tips: "Wrap around IconButton or BottomNavigationBarItem. label for count, omit for dot-only badge." },
  { name: "Tooltip", category: "Visual & Decoration", description: "Shows a tooltip on long press.", commonProps: ["message", "child", "decoration", "preferBelow", "waitDuration"], tips: "Essential for accessibility. Added automatically to IconButton via tooltip prop." },
  { name: "DecoratedBox", category: "Visual & Decoration", description: "Paints a decoration behind or in front of its child.", commonProps: ["decoration", "child", "position"], tips: "More efficient than Container when you only need decoration (no padding/margin/sizing)." },
  { name: "ClipRRect", category: "Visual & Decoration", description: "Clips child using a rounded rectangle.", commonProps: ["borderRadius", "child", "clipBehavior"], tips: "Use for rounded image corners. BorderRadius.circular(16) for uniform rounding." },
  { name: "Opacity", category: "Visual & Decoration", description: "Makes child partially transparent.", commonProps: ["opacity", "child"], tips: "opacity 0.0 = invisible (still takes space and receives taps). Use Visibility for hiding without painting." },

  // ── Images & Media ────────────────────────────────────────────────────
  { name: "Image", category: "Images & Media", description: "Displays an image.", commonProps: ["image", "width", "height", "fit", "alignment", "semanticLabel"], tips: "Use Image.network() for URLs, Image.asset() for bundled assets, Image.file() for device files. CachedNetworkImage for caching." },
  { name: "FadeInImage", category: "Images & Media", description: "Image that fades in when loaded.", commonProps: ["placeholder", "image", "fit", "fadeInDuration", "fadeOutDuration"], tips: "Use for smooth network image loading. AssetImage for placeholder, NetworkImage for image." },
  { name: "CircularProgressIndicator", category: "Images & Media", description: "Material Design circular progress indicator.", commonProps: ["value", "backgroundColor", "color", "strokeWidth"], tips: "value: null for indeterminate (spinning), 0.0-1.0 for determinate. Use LinearProgressIndicator for bars." },
  { name: "LinearProgressIndicator", category: "Images & Media", description: "Material Design linear progress indicator.", commonProps: ["value", "backgroundColor", "color", "minHeight"], tips: "value: null for indeterminate (animated), 0.0-1.0 for determinate progress." },

  // ── Gesture & Interaction ─────────────────────────────────────────────
  { name: "GestureDetector", category: "Gesture & Interaction", description: "Detects gestures like tap, drag, scale.", commonProps: ["child", "onTap", "onDoubleTap", "onLongPress", "onPanUpdate", "onScaleUpdate", "behavior"], tips: "Use behavior: HitTestBehavior.opaque to detect taps on transparent areas. Use InkWell for Material ripple effect." },
  { name: "InkWell", category: "Gesture & Interaction", description: "Material Design touch ripple effect.", commonProps: ["child", "onTap", "onLongPress", "borderRadius", "splashColor", "highlightColor"], tips: "Must have Material ancestor. Use borderRadius to match rounded containers. InkResponse for custom shapes." },
  { name: "Dismissible", category: "Gesture & Interaction", description: "Swipe-to-dismiss wrapper.", commonProps: ["key", "child", "onDismissed", "direction", "background", "secondaryBackground", "confirmDismiss"], tips: "Must provide unique key. Use confirmDismiss for undo pattern. background for left swipe, secondaryBackground for right." },
  { name: "Draggable", category: "Gesture & Interaction", description: "Makes a widget draggable.", commonProps: ["child", "feedback", "childWhenDragging", "data", "onDragStarted", "onDragEnd"], tips: "Pair with DragTarget. feedback is the widget shown during drag. data is passed to DragTarget.onAccept." },
  { name: "DragTarget", category: "Gesture & Interaction", description: "Receives data from Draggable widgets.", commonProps: ["builder", "onAcceptWithDetails", "onWillAcceptWithDetails", "onLeave"], tips: "builder receives (context, candidateData, rejectedData). Use onWillAccept to validate drop." },
  { name: "AbsorbPointer", category: "Gesture & Interaction", description: "Prevents child from receiving pointer events.", commonProps: ["absorbing", "child"], tips: "Use to disable interactions. Unlike IgnorePointer, AbsorbPointer stops events from reaching widgets behind it." },
  { name: "IgnorePointer", category: "Gesture & Interaction", description: "Makes child invisible to hit testing.", commonProps: ["ignoring", "child"], tips: "Events pass through to widgets behind. Use for overlay decorations that shouldn't block interaction." },

  // ── Animation ─────────────────────────────────────────────────────────
  { name: "AnimatedContainer", category: "Animation", description: "Container that automatically animates between values.", commonProps: ["duration", "curve", "child", "padding", "margin", "decoration", "width", "height", "alignment", "color"], tips: "Implicit animation - just change properties and it animates. Use curve: Curves.easeInOut for smooth transitions." },
  { name: "AnimatedOpacity", category: "Animation", description: "Animates opacity changes.", commonProps: ["opacity", "duration", "curve", "child", "onEnd"], tips: "Use for fade in/out. More efficient than wrapping Opacity in AnimationBuilder." },
  { name: "AnimatedCrossFade", category: "Animation", description: "Cross-fades between two children.", commonProps: ["firstChild", "secondChild", "crossFadeState", "duration", "firstCurve", "secondCurve"], tips: "Use CrossFadeState.showFirst/showSecond to toggle. Great for loading/loaded states." },
  { name: "AnimatedSwitcher", category: "Animation", description: "Animates between old and new child.", commonProps: ["child", "duration", "transitionBuilder", "switchInCurve", "switchOutCurve"], tips: "Child must have different key for animation to trigger. Default is FadeTransition. Custom transitionBuilder for slides." },
  { name: "Hero", category: "Animation", description: "Shared element transition between routes.", commonProps: ["tag", "child", "flightShuttleBuilder", "placeholderBuilder"], tips: "Same tag on both routes. Works with Navigator.push. Use flightShuttleBuilder for custom in-flight widget." },
  { name: "AnimatedBuilder", category: "Animation", description: "General-purpose animation builder using AnimationController.", commonProps: ["animation", "builder", "child"], tips: "child parameter is optimization - passed to builder but not rebuilt on animation tick. Use for explicit animations." },
  { name: "TweenAnimationBuilder", category: "Animation", description: "Animates from begin to end value with builder.", commonProps: ["tween", "duration", "builder", "child", "curve", "onEnd"], tips: "No AnimationController needed. Great for one-off animations. Supports any Tween (Color, double, Offset, etc.)." },

  // ── Dialog & Overlay ──────────────────────────────────────────────────
  { name: "AlertDialog", category: "Dialog & Overlay", description: "Material Design alert dialog.", commonProps: ["title", "content", "actions", "shape", "backgroundColor"], tips: "Show with showDialog(). actions is typically [TextButton, ElevatedButton]. Use SimpleDialog for selection lists." },
  { name: "SimpleDialog", category: "Dialog & Overlay", description: "Material Design simple dialog for selection.", commonProps: ["title", "children", "shape"], tips: "Show with showDialog(). Use SimpleDialogOption for each choice. Returns selected value via Navigator.pop." },
  { name: "SnackBar", category: "Dialog & Overlay", description: "Material Design snack bar for brief messages.", commonProps: ["content", "action", "duration", "behavior", "shape", "backgroundColor"], tips: "Show with ScaffoldMessenger.of(context).showSnackBar(). behavior: SnackBarBehavior.floating for floating style." },
  { name: "Banner", category: "Dialog & Overlay", description: "Displays a diagonal message over a corner.", commonProps: ["message", "location", "color", "child", "textStyle"], tips: "Use for debug/beta labels. BannerLocation.topEnd is common." },

  // ── Async & State ─────────────────────────────────────────────────────
  { name: "FutureBuilder", category: "Async & State", description: "Builds widget based on Future state.", commonProps: ["future", "builder", "initialData"], tips: "Do NOT create Future in build()! Store Future in initState or outside build. builder receives AsyncSnapshot with connectionState, data, error." },
  { name: "StreamBuilder", category: "Async & State", description: "Builds widget based on Stream events.", commonProps: ["stream", "builder", "initialData"], tips: "builder receives AsyncSnapshot. Handle ConnectionState.waiting, active, done. Great for real-time data." },
  { name: "ValueListenableBuilder", category: "Async & State", description: "Rebuilds when ValueNotifier changes.", commonProps: ["valueListenable", "builder", "child"], tips: "Lightweight state management. child parameter for optimization (not rebuilt). More efficient than setState for localized changes." },
  { name: "ListenableBuilder", category: "Async & State", description: "Rebuilds when Listenable notifies.", commonProps: ["listenable", "builder", "child"], tips: "Works with ChangeNotifier, AnimationController, any Listenable. Replaces AnimatedBuilder for non-animation use." },

  // ── Material 3 ────────────────────────────────────────────────────────
  { name: "SearchBar", category: "Material 3", description: "Material 3 search bar.", commonProps: ["controller", "onChanged", "onSubmitted", "leading", "trailing", "hintText"], tips: "Use SearchAnchor for full search experience with suggestions. Part of Material 3 design system." },
  { name: "SearchAnchor", category: "Material 3", description: "Material 3 search with suggestion overlay.", commonProps: ["builder", "suggestionsBuilder", "searchController"], tips: "Combines SearchBar with suggestion list. suggestionsBuilder returns async list of widgets." },
  { name: "SegmentedButton", category: "Material 3", description: "Material 3 segmented button for exclusive selection.", commonProps: ["segments", "selected", "onSelectionChanged", "multiSelectionEnabled"], tips: "Replacement for ToggleButtons in Material 3. segments is List<ButtonSegment>. selected is Set<T>." },
  { name: "FilledButton", category: "Material 3", description: "Material 3 filled button (highest emphasis).", commonProps: ["onPressed", "child", "style"], tips: "Material 3 equivalent of ElevatedButton. Use FilledButton.tonal() for medium emphasis." },
  { name: "NavigationDrawer", category: "Material 3", description: "Material 3 navigation drawer.", commonProps: ["children", "selectedIndex", "onDestinationSelected"], tips: "Material 3 replacement for Drawer. Use NavigationDrawerDestination for items." },
];

/**
 * Format the full widget catalog as markdown
 */
export function formatWidgetCatalog(): string {
  const categories = new Map<string, WidgetEntry[]>();

  for (const widget of widgetCatalog) {
    const existing = categories.get(widget.category) ?? [];
    categories.set(widget.category, [...existing, widget]);
  }

  let text = "# Flutter Widget Catalog\n\n";
  text += `**${widgetCatalog.length} widgets** organized by category.\n\n`;
  text += "---\n\n";

  for (const [category, widgets] of categories) {
    text += `## ${category}\n\n`;
    for (const w of widgets) {
      text += `### ${w.name}\n`;
      text += `${w.description}\n\n`;
      text += `**Key Props:** ${w.commonProps.join(", ")}\n\n`;
      text += `**Tips:** ${w.tips}\n\n`;
    }
  }

  return text;
}
