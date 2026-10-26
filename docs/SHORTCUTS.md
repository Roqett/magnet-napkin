# Shortcuts

## The mouse

| Action | How |
|---|---|
| Import a folder | drop it anywhere on the page, or **Import folder…** |
| Place an asset | drag it from the tray onto the canvas |
| Place an asset in the middle | click it in the tray (a double click places one, not two) |
| Select | click the item |
| Move | drag the item |
| Resize | drag the corner handle, bottom right |
| Free resize | turn **Aspect** off first |
| Rotate | drag the circle above the item; hold <kbd>Shift</kbd> for 15° steps |
| Edit a text box or a note | double click it |
| Pan the canvas | hold <kbd>Space</kbd> and drag, or use the scrollbars |
| Zoom | the <kbd>+</kbd> and <kbd>−</kbd> buttons, or the scroll wheel with <kbd>⌘</kbd>/<kbd>Ctrl</kbd> |

## The keyboard

| Key | What it does |
|---|---|
| <kbd>Tab</kbd> | move through the assets in the tray and the objects on the canvas |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | place the focused asset, or edit the focused text box or note |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | nudge by one canvas unit |
| <kbd>Shift</kbd> + arrows | nudge by ten units |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> | undo |
| <kbd>⇧</kbd> + <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> | redo |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>D</kbd> | duplicate the selection |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | delete the selection |
| <kbd>Esc</kbd> | deselect |
| <kbd>Alt</kbd>/<kbd>Option</kbd> while dragging | ignore snapping for that move |

One canvas unit is one unit of the canvas: a point on a pt canvas, a millimetre on a mm canvas.

## The canvas rules

These are the decisions that are not obvious, written down once:

- **An item's centre always stays on the canvas.** Half an item may hang off an edge, but it can never be lost off the board.
- **A newly placed asset comes in at its own size**: its pixels divided by the canvas scale. If your artwork is exported at twice the size — the `@2x` files that iOS and macOS apps ship — set **Asset ratio** to `2` in the inspector and everything lands at half that. The Redline panel assets are the reason it is there.
- **The aspect ratio is locked by default** for images, and unlocked by the **Aspect** switch. A text box resizes by its wrap width and the height follows the text.
- **Snapping** targets the grid, the canvas edges and centre, and the edges and centres of everything else on the board. A guide line appears when something snaps, and disappears when you let go. The grid step is in the inspector.
- **Rotation** is about the item's centre and is in degrees, clockwise. The X/Y/W/H in the inspector are the unrotated box.
- **Undo** keeps fifty steps. A drag is one step, not four hundred. Holding an arrow key is one step.
- **Locked** items can still be selected and inspected, but not moved, resized or rotated.
- **New** clears the board. The imported images stay in the tray, and the saved copy in the browser is cleared too.
