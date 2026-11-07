pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

import "../code/core/formatter.mjs" as Formatter

// Panel view: one segment per account with limits (badge, two small bars and
// their percents), or the plain icon when there is nothing to show or the
// panel is vertical.
MouseArea {
    id: compact

    property var viewModel: Formatter.buildViewModel([], 0)
    property bool horizontal: true

    readonly property var segments: compact.viewModel.sections.filter(section => section.windows.length > 0)
    readonly property bool showSegments: compact.horizontal && compact.segments.length > 0

    signal activated()

    implicitWidth: showSegments ? segmentRow.implicitWidth + Kirigami.Units.smallSpacing * 2 : icon.implicitWidth + Kirigami.Units.smallSpacing * 2
    implicitHeight: icon.implicitHeight
    Layout.minimumWidth: implicitWidth
    hoverEnabled: true
    activeFocusOnTab: true
    onClicked: activated()
    Keys.onReturnPressed: activated()
    Keys.onSpacePressed: activated()

    Accessible.role: Accessible.Button
    Accessible.name: "AI usage"
    Accessible.description: "Opens the AI usage details"
    Accessible.onPressAction: compact.activated()

    Kirigami.Icon {
        id: icon

        objectName: "panelIcon"
        anchors.centerIn: parent
        visible: !compact.showSegments
        source: "office-chart-bar"
        implicitWidth: Kirigami.Units.iconSizes.small
        implicitHeight: Kirigami.Units.iconSizes.small
        active: compact.containsMouse
        Accessible.ignored: true
    }

    RowLayout {
        id: segmentRow

        objectName: "panelSegments"
        anchors.centerIn: parent
        visible: compact.showSegments
        spacing: Kirigami.Units.largeSpacing

        Repeater {
            model: compact.showSegments ? compact.segments : []

            RowLayout {
                id: segment

                required property var modelData

                objectName: "panelSegment-" + segment.modelData.key
                spacing: Kirigami.Units.smallSpacing
                Accessible.ignored: true

                AccentColors {
                    id: colors
                    accentHex: segment.modelData.accent
                }

                Badge {
                    letter: segment.modelData.badge
                    accent: colors.accent
                    size: Math.round(Kirigami.Units.gridUnit * 1.1)
                    Layout.alignment: Qt.AlignVCenter
                }

                ColumnLayout {
                    spacing: Math.round(Kirigami.Units.smallSpacing / 2)
                    Layout.alignment: Qt.AlignVCenter

                    Repeater {
                        model: segment.modelData.windows.slice(0, 2)

                        Rectangle {
                            id: track

                            required property var modelData

                            implicitWidth: Kirigami.Units.gridUnit * 1.4
                            implicitHeight: Math.max(3, Math.round(Kirigami.Units.smallSpacing * 0.9))
                            radius: height / 2
                            color: colors.track(colors.bar(track.modelData))

                            Rectangle {
                                width: parent.width * track.modelData.fraction
                                height: parent.height
                                radius: parent.radius
                                color: colors.bar(track.modelData)
                            }
                        }
                    }
                }

                ColumnLayout {
                    spacing: 0
                    Layout.alignment: Qt.AlignVCenter

                    Repeater {
                        model: segment.modelData.windows.slice(0, 2)

                        PlasmaComponents.Label {
                            required property var modelData

                            objectName: "panelPercent"
                            text: modelData.percentText
                            textFormat: Text.PlainText
                            color: modelData.isExpired ? Kirigami.Theme.disabledTextColor : Kirigami.Theme.textColor
                            font.pointSize: Kirigami.Theme.smallFont.pointSize * 0.95
                            font.features: { "tnum": 1 }
                            lineHeight: 0.9
                            horizontalAlignment: Text.AlignRight
                            Layout.alignment: Qt.AlignRight
                        }
                    }
                }
            }
        }
    }
}
