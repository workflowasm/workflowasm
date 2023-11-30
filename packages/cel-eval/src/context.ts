import { IMessageTypeRegistry, MessageType } from "@bufbuild/protobuf"
import { Value } from "@workflowasm/protocols-js"

export class Context {
  messageTypeRegistry: IMessageTypeRegistry

  constructor(options: { messageTypeRegistry: IMessageTypeRegistry }) {
    this.messageTypeRegistry = options.messageTypeRegistry
  }

  evaluateIdentifier(name: string): Value | undefined {
    return undefined
  }

  findMessage(typeName: string): MessageType | undefined {
    return this.messageTypeRegistry.findMessage(typeName)
  }
}
