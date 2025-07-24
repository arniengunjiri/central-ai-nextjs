"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import {
  NameType,
  Payload,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent"

// Assuming cn is correctly imported from "@/lib/utils"
// If you don't have this utility, a basic implementation might look like:
// import { type ClassValue, clsx } from "clsx"
// import { twMerge } from "tailwind-merge"
// export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
import { cn } from "@/lib/utils"

// Defines the available themes and their corresponding CSS selectors
const THEMES = { light: "", dark: ".dark" } as const

/**
 * Defines the configuration structure for chart elements.
 * Each key represents a data key in your chart, and its value
 * provides display properties like label, icon, and color (with theme support).
 */
export type ChartConfig = {
  [k in string]: {
  label?: React.ReactNode // Display label for the chart element
  icon?: React.ComponentType // Optional icon component
} & (
    | { color?: string; theme?: never } // Direct color definition
    | { color?: never; theme: Record<keyof typeof THEMES, string> } // Theme-specific colors
    )
}

/**
 * Context to provide ChartConfig to nested chart components.
 */
type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

/**
 * Custom hook to access the ChartConfig from the ChartContext.
 * Throws an error if used outside of a ChartContainer.
 */
function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

/**
 * Main container component for Recharts charts.
 * It provides the ChartConfig via context, applies base styling,
 * and wraps the chart content in a ResponsiveContainer.
 */
function ChartContainer({
                          id,
                          className,
                          children,
                          config,
                          ...props
                        }: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  // Generate a unique ID for the chart, falling back to a generated one if not provided
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
      <ChartContext.Provider value={{ config }}>
        <div
            data-slot="chart"
            data-chart={chartId}
            // Tailwind CSS classes for general chart styling and Recharts overrides
            className={cn(
                "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
                className
            )}
            {...props}
        >
          {/* Injects dynamic CSS variables based on ChartConfig */}
          <ChartStyle id={chartId} config={config} />
          {/* Recharts ResponsiveContainer for responsive chart rendering */}
          <RechartsPrimitive.ResponsiveContainer>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
  )
}

/**
 * Component to dynamically generate CSS variables for chart colors based on ChartConfig.
 * This allows Tailwind CSS to use these variables for styling.
 */
const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  // Filter config entries that have color or theme defined
  const colorConfig = Object.entries(config).filter(
      ([, itemConfig]) => itemConfig.theme || itemConfig.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
      <style
          dangerouslySetInnerHTML={{
            __html: Object.entries(THEMES)
                .map(
                    ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
                        .map(([key, itemConfig]) => {
                          // Determine the color based on theme or direct color property
                          const color =
                              itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
                              itemConfig.color
                          return color ? `  --color-${key}: ${color};` : null
                        })
                        .filter(Boolean) // Remove null entries
                        .join("\n")}
}
`
                )
                .join("\n"),
          }}
      />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

/**
 * Props interface for ChartTooltipContent.
 * Combines standard HTML div attributes with specific Recharts Tooltip properties.
 */
interface ChartTooltipContentProps
    extends React.HTMLAttributes<HTMLDivElement>,
        Omit<RechartsPrimitive.TooltipProps<ValueType, NameType>, 'payload' | 'label' | 'labelFormatter' | 'formatter' | 'color' | 'content'> // Omit 'content' as well
{
  active?: boolean;
  // Explicitly type payload as an array of Recharts Payload objects
  payload?: Array<Payload<ValueType, NameType>>;
  label?: React.ReactNode; // Explicitly define label
  labelFormatter?: (value: any, payload: Array<Payload<ValueType, NameType>>) => React.ReactNode; // Explicitly define labelFormatter
  formatter?: (value: ValueType, name: NameType, props: Payload<ValueType, NameType>, index: number, payload: Array<Payload<ValueType, NameType>>) => React.ReactNode; // Explicitly define formatter
  color?: string; // Custom color prop for the tooltip indicator
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  labelClassName?: string;
}

/**
 * Custom content component for Recharts Tooltip.
 * Displays detailed information for hovered chart elements.
 */
function ChartTooltipContent({
                               active,
                               payload,
                               className,
                               indicator = "dot",
                               hideLabel = false,
                               hideIndicator = false,
                               label,
                               labelFormatter,
                               labelClassName,
                               formatter,
                               color,
                               nameKey,
                               labelKey,
                             }: ChartTooltipContentProps) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    // Ensure item exists before trying to access its properties
    if (!item) return null;

    // Determine the key for fetching config, preferring labelKey, then dataKey/name, then "value"
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)

    // Determine the label value, preferring formatted label, then config label, then raw label
    const value =
        !labelKey && typeof label === "string"
            ? config[label as keyof typeof config]?.label || label
            : itemConfig?.label

    if (labelFormatter) {
      return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  // Determine if the label should be nested (e.g., for single item tooltips with line/dashed indicator)
  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
      <div
          className={cn(
              "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
              className
          )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item: Payload<ValueType, NameType>, index: number) => {
            // Determine the key for fetching config, preferring nameKey, then dataKey/name, then "value"
            const key = `${nameKey || String(item.name || item.dataKey || "") || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            // Determine the indicator color, preferring custom color, then payload fill, then item color
            const indicatorColor = color || item.payload?.fill || item.color

            return (
                <div
                    key={item.dataKey ? String(item.dataKey) : `item-${index}`} // Use dataKey or a unique index-based key
                    className={cn(
                        "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                        indicator === "dot" && "items-center"
                    )}
                >
                  {formatter && item?.value !== undefined && item.name ? (
                      // If a custom formatter is provided, use it
                      formatter(item.value, item.name, item, index, item.payload)
                  ) : (
                      // Otherwise, render the default indicator and content
                      <>
                        {itemConfig?.icon ? (
                            // Render custom icon if available
                            <itemConfig.icon />
                        ) : (
                            // Render default indicator if not hidden
                            !hideIndicator && (
                                <div
                                    className={cn(
                                        "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", // Correct Tailwind arbitrary value syntax
                                        {
                                          "h-2.5 w-2.5": indicator === "dot",
                                          "w-1": indicator === "line",
                                          "w-0 border-[1.5px] border-dashed bg-transparent":
                                              indicator === "dashed",
                                          "my-0.5": nestLabel && indicator === "dashed",
                                        }
                                    )}
                                    style={
                                      {
                                        "--color-bg": indicatorColor,
                                        "--color-border": indicatorColor,
                                      } as React.CSSProperties
                                    }
                                />
                            )
                        )}
                        <div
                            className={cn(
                                "flex flex-1 justify-between leading-none",
                                nestLabel ? "items-end" : "items-center"
                            )}
                        >
                          <div className="grid gap-1.5">
                            {nestLabel ? tooltipLabel : null}
                            <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                          </div>
                          {item.value && (
                              <span className="text-foreground font-mono font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                          )}
                        </div>
                      </>
                  )}
                </div>
            )
          })}
        </div>
      </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

/**
 * Local type definition for Recharts Legend payload items.
 * This is necessary because LegendPayload is not exported from 'recharts/types/component/Legend'.
 */
type RechartsLegendPayload = {
  value?: string | number;
  id?: string;
  type?: string;
  color?: string;
  payload?: any; // Can be more specific if the structure is known
  dataKey?: string | number;
  name?: string;
};

/**
 * Props interface for ChartLegendContent.
 * Combines standard HTML div attributes with specific Recharts Legend properties.
 */
interface ChartLegendContentProps extends React.HTMLAttributes<HTMLDivElement> {
  payload?: RechartsLegendPayload[]; // Explicitly type payload for legend
  verticalAlign?: RechartsPrimitive.LegendProps['verticalAlign'];
  hideIcon?: boolean;
  nameKey?: string;
}

/**
 * Custom content component for Recharts Legend.
 * Displays legend items with their corresponding icons/color swatches and labels.
 */
function ChartLegendContent({
                              className,
                              hideIcon = false,
                              payload,
                              verticalAlign = "bottom",
                              nameKey,
                            }: ChartLegendContentProps) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
      <div
          className={cn(
              "flex items-center justify-center gap-4",
              verticalAlign === "top" ? "pb-3" : "pt-3",
              className
          )}
      >
        {payload.map((item: RechartsLegendPayload, index: number) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
              <div
                  key={item.value ? String(item.value) : `legend-item-${index}`} // Use value or a unique index-based key
                  className={cn(
                      "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
                  )}
              >
                {itemConfig?.icon && !hideIcon ? (
                    // Render custom icon if available and not hidden
                    <itemConfig.icon />
                ) : (
                    // Render default color swatch
                    <div
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{
                          backgroundColor: item.color,
                        }}
                    />
                )}
                {itemConfig?.label}
              </div>
          )
        })}
      </div>
  )
}

/**
 * Helper function to extract the chart item configuration from the ChartConfig
 * based on a given payload item and key.
 * It handles different ways the key might be present in the payload.
 */
function getPayloadConfigFromPayload(
    config: ChartConfig,
    payload: unknown, // Payload item from Recharts (can be from tooltip or legend)
    key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  // Cast payload to a more general object type for safe property access
  const typedPayload = payload as {
    payload?: Record<string, unknown>
    dataKey?: string | number
    name?: string | number
    [k: string]: unknown // Allow indexing with string
  }

  // Access nested 'payload' property if it exists
  const payloadPayload =
      typedPayload.payload &&
      typeof typedPayload.payload === "object" &&
      typedPayload.payload !== null
          ? typedPayload.payload
          : undefined

  let configLabelKey: string = key

  // Check if the key exists directly on the payload or its nested payload
  // and convert to string for consistent lookup in ChartConfig
  if (
      key in typedPayload &&
      (typeof typedPayload[key] === "string" ||
          typeof typedPayload[key] === "number")
  ) {
    configLabelKey = String(typedPayload[key])
  } else if (
      payloadPayload &&
      key in payloadPayload &&
      (typeof payloadPayload[key] === "string" ||
          typeof payloadPayload[key] === "number")
  ) {
    configLabelKey = String(payloadPayload[key])
  }

  // Return the configuration for the determined key, or fallback to the original key
  return configLabelKey in config
      ? config[configLabelKey]
      : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
