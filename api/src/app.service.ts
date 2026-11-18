import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getRoot() {
    return {
      message: "Contentual API"
    };
  }

  getHealth() {
    return {
      ok: true,
      service: "api"
    };
  }
}
