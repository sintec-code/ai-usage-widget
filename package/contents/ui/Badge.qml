import QtQuick
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

// Rounded square with the account letter, tinted with the service accent.
Rectangle {
    id: badge

    property string letter
    property color accent: Kirigami.Theme.highlightColor
    property real size: Kirigami.Units.gridUnit * 2

    implicitWidth: size
    implicitHeight: size
    radius: Math.round(size / 4)
    color: Qt.rgba(accent.r, accent.g, accent.b, 0.22)
    Accessible.ignored: true

    PlasmaComponents.Label {
        anchors.centerIn: parent
        text: badge.letter
        textFormat: Text.PlainText
        color: badge.accent
        font.bold: true
        font.pixelSize: Math.round(badge.size * 0.5)
    }
}
