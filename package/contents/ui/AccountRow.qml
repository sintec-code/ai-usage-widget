pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

// Compact account under the main card; clicking it makes it the main card.
GlassPanel {
    id: row

    property var section

    signal selected()

    objectName: "card-" + section.key
    implicitHeight: content.implicitHeight + Kirigami.Units.largeSpacing * 2
    activeFocusOnTab: true

    Accessible.role: Accessible.Button
    Accessible.name: row.section.title + " " + row.section.account
    Accessible.description: "Shows this account as the main card"
    Accessible.onPressAction: row.selected()
    Keys.onReturnPressed: row.selected()
    Keys.onSpacePressed: row.selected()

    SeverityColors {
        id: severity
    }

    AccentColors {
        id: colors
        accentHex: row.section.accent
    }

    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: Kirigami.Theme.textColor
        opacity: hover.containsMouse || row.activeFocus ? 0.06 : 0
    }

    MouseArea {
        id: hover

        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: row.selected()
    }

    RowLayout {
        id: content

        anchors.fill: parent
        anchors.margins: Kirigami.Units.largeSpacing
        spacing: Kirigami.Units.largeSpacing

        Badge {
            letter: row.section.badge
            accent: colors.accent
            size: Kirigami.Units.gridUnit * 1.75
            Layout.alignment: Qt.AlignVCenter
        }

        ColumnLayout {
            spacing: Kirigami.Units.smallSpacing
            Layout.fillWidth: true

            RowLayout {
                spacing: Kirigami.Units.smallSpacing
                Layout.fillWidth: true

                PlasmaComponents.Label {
                    objectName: "serviceName"
                    text: row.section.title
                    textFormat: Text.PlainText
                    font.bold: true
                }

                PlasmaComponents.Label {
                    objectName: "accountName"
                    text: row.section.account
                    textFormat: Text.PlainText
                    opacity: 0.7
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                PlasmaComponents.BusyIndicator {
                    visible: row.section.isLoading
                    running: visible
                    implicitWidth: Kirigami.Units.iconSizes.small
                    implicitHeight: Kirigami.Units.iconSizes.small
                    Accessible.name: "Checking now"
                }
            }

            PlasmaComponents.Label {
                objectName: "errorText"
                visible: row.section.hasError
                text: row.section.errorText
                textFormat: Text.PlainText
                color: severity.text(row.section.errorSeverity)
                font.pointSize: Kirigami.Theme.smallFont.pointSize
                Layout.fillWidth: true
                wrapMode: Text.Wrap
            }

            RowLayout {
                spacing: Kirigami.Units.largeSpacing
                Layout.fillWidth: true

                Repeater {
                    model: row.section.windows.slice(0, 2)

                    MiniBar {
                        required property var modelData

                        item: modelData
                        accentHex: row.section.accent
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                    }
                }
            }
        }
    }
}
