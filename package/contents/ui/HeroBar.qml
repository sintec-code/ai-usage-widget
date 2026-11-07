import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

// One limit on the main card: heading and rate, the big percent, a bar with a
// marker at the time already passed in the window, and the reset text.
ColumnLayout {
    id: limit

    property var item
    property string accentHex: ""

    readonly property color barColor: colors.bar(limit.item)
    readonly property bool hasMarker: limit.item.elapsedFraction !== null && limit.item.elapsedFraction !== undefined

    spacing: Math.round(Kirigami.Units.smallSpacing / 2)

    Accessible.role: Accessible.ProgressBar
    Accessible.name: limit.item.heading
    Accessible.description: limit.item.percentText + (limit.item.resetText !== "" ? ", " + limit.item.resetText : "")

    AccentColors {
        id: colors
        accentHex: limit.accentHex
    }

    RowLayout {
        Layout.fillWidth: true

        PlasmaComponents.Label {
            objectName: "barLabel"
            text: limit.item.heading
            textFormat: Text.PlainText
            opacity: 0.75
            elide: Text.ElideRight
            Layout.fillWidth: true
            Accessible.ignored: true
        }

        PlasmaComponents.Label {
            objectName: "rateText"
            visible: limit.item.rateText !== ""
            text: limit.item.rateText
            textFormat: Text.PlainText
            opacity: 0.75
            font.features: { "tnum": 1 }
            Accessible.ignored: true
        }
    }

    PlasmaComponents.Label {
        objectName: "percentText"
        text: limit.item.percentText
        textFormat: Text.PlainText
        color: limit.item.isExpired ? Kirigami.Theme.disabledTextColor : Kirigami.Theme.textColor
        font.bold: true
        font.pointSize: Kirigami.Theme.defaultFont.pointSize * 2.1
        font.features: { "tnum": 1 }
        Accessible.ignored: true
    }

    Item {
        id: track

        readonly property real markerSize: Math.round(Kirigami.Units.gridUnit * 0.95)

        Layout.fillWidth: true
        implicitHeight: markerSize

        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            height: Math.round(Kirigami.Units.smallSpacing * 1.5)
            radius: height / 2
            color: colors.track(limit.barColor)

            Rectangle {
                width: parent.width * limit.item.fraction
                height: parent.height
                radius: parent.radius
                color: limit.barColor
            }
        }

        Rectangle {
            objectName: "elapsedMarker"
            visible: limit.hasMarker
            width: track.markerSize
            height: track.markerSize
            radius: width / 2
            x: Math.min(Math.max(track.width * (limit.hasMarker ? limit.item.elapsedFraction : 0) - width / 2, 0), track.width - width)
            anchors.verticalCenter: parent.verticalCenter
            color: Kirigami.Theme.textColor
            border.width: 2
            border.color: Kirigami.Theme.backgroundColor

            Kirigami.Icon {
                anchors.centerIn: parent
                width: Math.round(parent.width * 0.62)
                height: width
                source: "chronometer-symbolic"
                color: Kirigami.Theme.backgroundColor
                isMask: true
            }
        }
    }

    PlasmaComponents.Label {
        objectName: "resetText"
        visible: limit.item.resetText !== ""
        text: limit.item.resetText
        textFormat: Text.PlainText
        opacity: 0.7
        Layout.fillWidth: true
        wrapMode: Text.Wrap
        Accessible.ignored: true
    }
}
