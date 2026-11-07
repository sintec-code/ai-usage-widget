import QtQuick
import org.kde.kirigami as Kirigami

import "../code/core/formatter.mjs" as Formatter

// Colours of the redesigned cards: the service accent, turned to the theme
// warning colours when a limit is close and greyed when the data has expired.
QtObject {
    id: colors

    property string accentHex: ""
    readonly property color accent: accentHex !== "" ? accentHex : Kirigami.Theme.highlightColor

    function bar(item) {
        if (item.isExpired) {
            return Kirigami.Theme.disabledTextColor
        }
        switch (item.severity) {
        case Formatter.SEVERITY.CRITICAL:
            return Kirigami.Theme.negativeTextColor
        case Formatter.SEVERITY.WARNING:
            return Kirigami.Theme.neutralTextColor
        default:
            return colors.accent
        }
    }

    function track(color) {
        return Qt.rgba(color.r, color.g, color.b, 0.22)
    }
}
