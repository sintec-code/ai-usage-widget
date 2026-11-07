import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

// Short label, percent and a thin bar for the compact account rows.
ColumnLayout {
    id: mini

    property var item
    property string accentHex: ""

    readonly property color barColor: colors.bar(mini.item)

    spacing: Math.round(Kirigami.Units.smallSpacing / 2)

    Accessible.role: Accessible.ProgressBar
    Accessible.name: mini.item.heading
    Accessible.description: mini.item.percentText

    AccentColors {
        id: colors
        accentHex: mini.accentHex
    }

    RowLayout {
        Layout.fillWidth: true

        PlasmaComponents.Label {
            text: mini.item.shortLabel
            textFormat: Text.PlainText
            opacity: 0.7
            elide: Text.ElideRight
            Layout.fillWidth: true
            Accessible.ignored: true
        }

        PlasmaComponents.Label {
            objectName: "percentText"
            text: mini.item.percentText
            textFormat: Text.PlainText
            color: mini.item.isExpired ? Kirigami.Theme.disabledTextColor : Kirigami.Theme.textColor
            font.features: { "tnum": 1 }
            Accessible.ignored: true
        }
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: Math.max(2, Math.round(Kirigami.Units.smallSpacing * 0.75))
        radius: height / 2
        color: colors.track(mini.barColor)

        Rectangle {
            width: parent.width * mini.item.fraction
            height: parent.height
            radius: parent.radius
            color: mini.barColor
        }
    }
}
