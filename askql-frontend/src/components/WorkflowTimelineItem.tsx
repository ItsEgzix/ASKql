import React from "react";
import { Disclosure } from "@headlessui/react";
import { WorkflowStep } from "@/lib/askql-api";
import dayjs from "dayjs";
import { cn } from "../utils/cn";

interface Props {
  step: WorkflowStep;
}

function niceLabel(id: string) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkflowTimelineItem({ step }: Props) {
  return (
    <li className="relative pl-8">
      {/* status dot */}
      <span
        className={cn(
          "absolute left-1 top-1 h-3 w-3 rounded-full ring-2 ring-white",
          step.status === "completed" && "bg-green-500",
          step.status === "processing" && "bg-blue-500 animate-pulse",
          step.status === "error" && "bg-red-500",
          step.status === "starting" && "bg-orange-400"
        )}
      ></span>

      <div className="flex items-start gap-2">
        <p className="font-medium text-gray-800">{niceLabel(step.step)}</p>
        <small className="text-xs text-gray-500">
          {dayjs(step.timestamp).format("HH:mm:ss")}
        </small>
      </div>
      {step.message && (
        <p className="mt-1 text-sm text-gray-600">{step.message}</p>
      )}

      {step.data && (
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="mt-2 text-xs text-blue-600 focus:outline-none">
                {open ? "Hide details" : "Show details"}
              </Disclosure.Button>
              <Disclosure.Panel>
                <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(step.data, null, 2)}
                </pre>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      )}
    </li>
  );
}
